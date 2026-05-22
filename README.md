# dep-scanner

A production-grade, cross-project dependency vulnerability scanner for Node.js codebases. Crawls every `package-lock.json` across a monorepo or project folder, queries the OSV.dev vulnerability database, and surfaces results across three output channels: a terminal report, an interactive HTML dashboard, and a PDF attached to an email.

---

## Table of Contents

- [What this is](#what-this-is)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Phase 1 — The Crawler](#phase-1--the-crawler)
- [Phase 2 — The Extraction Engine](#phase-2--the-extraction-engine)
- [Phase 3 — The Scanner](#phase-3--the-scanner)
- [Phase 4 — The Reporter](#phase-4--the-reporter)
- [Phase 5 — GitHub Actions CI](#phase-5--github-actions-ci)
- [Shared Utilities](#shared-utilities)
- [Running & Testing](#running--testing)
- [Engineering Decisions](#engineering-decisions)
- [Import Rules](#import-rules)

---

## What this is

dep-scanner is a zero-dashboard, self-contained auditing tool. You point it at a folder, it finds every Node.js project inside, flattens and deduplicates the full dependency tree (including transitive dependencies five levels deep), checks every unique package against OSV.dev in batched concurrent requests, normalises inconsistent severity data into a five-tier scale, and then renders the results to whichever output channels you need.

The tool was built to answer a specific question: _across all of my projects, which exact package version is vulnerable, in which projects does it appear, and how serious is it?_ The inverted index at the heart of Phase 2 makes that cross-project deduplication efficient — a package shared by ten projects is queried once, not ten times.

**What it does:**

- Discovers all `package-lock.json` files under a configurable root path
- Parses both npm v1 (nested tree) and v2/v3 (flat) lockfile formats
- Builds a deduplicated inverted index of every installed package version
- Queries OSV.dev with batched concurrent requests, respecting rate limits
- Normalises severity via a three-path resolution chain (label → nested label → CVSS 3.1 vector math)
- Caches all results for 24 hours with atomic writes and a serial flush queue
- Outputs to CLI, interactive HTML dashboard, PDF email attachment, or all three
- Runs as a scheduled GitHub Actions workflow with severity-gated exit codes

**What it is not:**

- Not an HTTP server or always-on daemon
- Not a replacement for `npm audit` on a single project
- Not tied to any specific framework — it reads lockfiles, not application code

---

## System Architecture

The pipeline is strictly linear. Each phase produces a well-defined output that becomes the input for the next. No phase reaches backward into a previous phase's internals.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         dep-scanner pipeline                        │
│                                                                     │
│  SEARCH_PATH                                                        │
│      │                                                              │
│      ▼                                                              │
│  ┌──────────┐    lockfiles[]     ┌───────────┐    { uniqueDeps,    │
│  │ Phase 1  │ ─────────────────► │  Phase 2  │      invertedIndex} │
│  │ Crawler  │                    │ Extractor │ ──────────────────┐  │
│  └──────────┘                    └───────────┘                   │  │
│                                                                   │  │
│  fast-glob                       DFS (v1) /                      │  │
│  discovers                       flat-iter (v3)                  │  │
│  package-lock.json               builds inverted index           ▼  │
│                                                                      │
│                                                         ┌──────────┐ │
│                                                         │ Phase 3  │ │
│                                                         │ Scanner  │ │
│                                                         └────┬─────┘ │
│                                                              │        │
│                                            VulnResult[]     │        │
│  ┌───────────────────────────────────────────────────────────┘        │
│  │                                                                     │
│  ▼                                                                     │
│  ┌──────────┐    ReportData      ┌─────────────────────────────────┐  │
│  │ Phase 4  │ ─────────────────► │           Renderers             │  │
│  │aggregate │                    │  CLI │ HTML Dashboard │ PDF/SMTP │  │
│  └──────────┘                    └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

```
Phase 3 — Scanner internals

  uniqueDeps[]
       │
       ▼
  ┌──────────┐    cache hits       ┌──────────────────────────────────┐
  │  detect  │ ─────────────────► │  pending[] { dep, advisoryId }   │
  │  Pass 1  │    OSV /querybatch  │                                  │
  └──────────┘    (concurrent)     └──────────────────┬───────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │   enrich     │
                                              │   Pass 2     │
                                              │ semaphore=15 │
                                              └──────┬───────┘
                                                     │
                                                     ▼
                                             advisoryMap (cache-aside)
                                                     │
                                                     ▼
                                              mapper.js → VulnResult[]
```

### Architectural pillars

**Phase separation.** Each phase has one job. The crawler never reads lockfile contents. The extractor never touches the network. The scanner never decides how to render. The reporter never re-derives severity. Violations of this would couple layers that change for different reasons.

**Pure aggregation layer.** `aggregate.js` sits between raw scanner output and all renderers. It is a pure function — given the same `VulnResult[]` it always produces the same `ReportData`. This guarantees that the CLI, HTML dashboard, and PDF report show identical totals. Without this layer, each renderer would derive its own counts independently, creating the risk of metric drift across output channels.

**Fail-visible, not fail-silent.** Network failures during OSV batch requests produce `SCAN_ERROR` rows in the report rather than silently dropping packages. Advisory enrichment failures produce `Unknown` severity stubs. In both cases the user sees that data is missing rather than receiving a false-clean result.

**Config as a single source of truth.** All user-configurable values and internal tuning constants live in `config/scanner.config.js`. Module-local magic numbers are not permitted. This means changing the chunk size, concurrency limit, cache TTL, or retry delay is always a one-line change in one file.

---

## Project Structure

```
dep-scanner/
├── config/
│   └── scanner.config.js          # All configuration — user values + internal constants
│
├── core/
│   ├── index.js                   # Pipeline orchestrator — the only file that imports across phases
│   │
│   ├── crawler/
│   │   └── index.js               # Phase 1: fast-glob project discovery
│   │
│   ├── extractor/
│   │   ├── index.js               # Phase 2: DFS parser + inverted index builder
│   │   └── tests/
│   │       └── extractor.test.js  # 34-assertion lockfile parsing test suite
│   │
│   ├── scanner/
│   │   ├── index.js               # Phase 3 orchestrator: sequences Pass 1 → Pass 2
│   │   ├── detect.js              # Pass 1: batch detection against OSV /querybatch
│   │   ├── enrich.js              # Pass 2: full advisory enrichment with semaphore
│   │   ├── osv.js                 # OSV API client with exponential-backoff retry
│   │   ├── severity.js            # CVSS 3.1 math + three-path severity resolution
│   │   └── mapper.js              # Raw OSV advisory → normalised VulnResult
│   │
│   ├── cache/
│   │   ├── index.js               # Atomic JSON cache — TTL, serial flush queue, pruning
│   │   └── cache.json             # Generated — gitignored, machine-specific
│   │
│   ├── reporter/
│   │   ├── aggregate.js           # Pure data transformation: VulnResult[] → ReportData
│   │   │
│   │   ├── cli/
│   │   │   └── cli.js             # Terminal renderer: severity-grouped stdout output
│   │   │
│   │   ├── dashboard/
│   │   │   ├── dashboard.js       # HTML renderer: builds the interactive report
│   │   │   ├── layout.js          # HTML document shell template
│   │   │   ├── styles.js          # CSS-in-JS: theme tokens → CSS custom properties
│   │   │   ├── client.js          # Vanilla JS: sorting, filtering, tab switching
│   │   │   └── escape.js          # Server-side HTML escaper (shared by layout + dashboard)
│   │   │
│   │   ├── mailer/
│   │   │   ├── mailer.js          # Nodemailer transport + subject line logic
│   │   │   ├── email-body.js      # HTML + plain-text email templates
│   │   │   ├── pdf.js             # Puppeteer: HTML → PDF buffer
│   │   │   ├── pdf-report.js      # Static print-optimised HTML template for PDF
│   │   │   ├── pdf-layout.js      # PDF section renderers: summary cards + severity tables
│   │   │   └── pdf-styles.js      # Inline CSS constants for PDF (A4, @page, table-layout)
│   │   │
│   │   └── themes/
│   │       ├── dark.js            # Design tokens for the interactive HTML dashboard
│   │       └── light.js           # Design tokens for the email body (no dark mode in email clients)
│   │
│   └── utils/
│       ├── chunk.js               # chunkArray(arr, size): splits dep list into OSV batch slices
│       ├── retry.js               # withRetry(fn, opts): exponential backoff for 5xx faults
│       └── semaphore.js           # createSemaphore(limit): concurrency cap for advisory fetches
│
├── .github/
│   └── workflows/
│       └── scan.yml               # Phase 5: scheduled GitHub Actions workflow
│
├── report.html                    # Generated on scan — gitignored
├── notes.md                       # Dev notes
├── package.json
└── README.md
```

---

## Configuration

All configuration lives in `config/scanner.config.js`. The file is split into two concerns: values you change between environments (overridable via environment variables so CI can inject them without touching the file) and internal constants that tune the engine.

```js
// ─── Paths ────────────────────────────────────────────────────────────────────
export const SEARCH_PATH = process.env.SEARCH_PATH;

// ─── Scan behaviour ───────────────────────────────────────────────────────────
export const SCAN_MODE = process.env.SCAN_MODE ?? "prod"; // "prod" | "all"

// ─── Report output ────────────────────────────────────────────────────────────
// "cli"   → terminal only
// "email" → SMTP only  (requires SMTP_* env vars + REPORT_TO)
// "html"  → writes report.html to project root, no email
// "both"  → terminal + SMTP + HTML file
export const REPORT_TYPE = process.env.REPORT_TYPE ?? "html";

// ─── Cache ────────────────────────────────────────────────────────────────────
export const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── OSV API ──────────────────────────────────────────────────────────────────
export const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
export const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";

// ─── Scanner tuning ───────────────────────────────────────────────────────────
export const CHUNK_SIZE = 1000; // max queries per OSV batch request
export const CONCURRENCY_LIMIT = 15; // max simultaneous advisory fetches
export const MAX_RETRIES = 3; // OSV 5xx retry ceiling
export const RETRY_BASE_DELAY_MS = 500; // doubles each attempt: 500→1000→2000ms

// ─── Crawler ──────────────────────────────────────────────────────────────────
export const IGNORE_LIST = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/temp/**",
];

export const CRAWLER_OPTIONS = {
  deep: 5, // reaches Project > client > package-lock.json in monorepos
  onlyFiles: true,
};
```

**Rule:** Values that differ between machines → `scanner.config.js` (with `process.env` fallbacks). Secrets → `.env`. Internal implementation constants (API URLs, TTL, chunk size) → `scanner.config.js`, never inlined in module code.

### Environment variables

For local use, create a `.env` file in the project root. For CI, set these as GitHub Actions repository secrets.

```bash
# ── SMTP (Nodemailer) ──────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false               # "true" for port 465 (TLS), leave empty for 587 (STARTTLS)
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx  # Gmail App Password — not your account password
REPORT_TO=you@gmail.com         # comma-separated for multiple recipients

# ── Scanner overrides ────────────────────────────────────────────────────────
SEARCH_PATH=/absolute/path/to/your/projects
REPORT_TYPE=both                # cli | email | html | both
SCAN_MODE=all                   # prod | all
```

---

## Phase 1 — The Crawler

**File:** `core/crawler/index.js`

**Input:** `SEARCH_PATH` and `IGNORE_LIST` from config  
**Output:** `Array<{ project: string, lockfilePath: string }>`

The crawler's only job is discovery. It uses `fast-glob` to perform a concurrent deep scan for `package-lock.json` files from the configured root, excludes noise paths via `IGNORE_LIST`, and returns a labelled list of lockfile paths.

```js
export async function scanProjects() {
  const pattern = `${SEARCH_PATH}/**/package-lock.json`;
  const entries = await fg(pattern, {
    ignore: IGNORE_LIST,
    ...CRAWLER_OPTIONS,
  });

  return entries.map((file) => ({
    project: path.basename(path.dirname(file)), // "jobseeker-backend"
    lockfilePath: file, // "/home/user/Projects/jobseeker-backend/package-lock.json"
  }));
}
```

The project name is derived from the immediate parent directory of the lockfile. Phase 2 needs this name to populate the inverted index — a bare path is not sufficient.

**Why `fast-glob` over a custom recursive walk?**

`fast-glob` issues directory reads concurrently using async I/O. A hand-rolled `fs.readdirSync` loop is synchronous and blocking — it reads one directory at a time and stalls the event loop while waiting for disk. With many projects and nested `node_modules`, the difference is significant. The crawler is infrastructure, not the interesting part of this project, and using a well-tested tool for a solved problem is the right call.

**Why `package-lock.json` and not `package.json`?**

`package.json` is a wishlist with version ranges. The lockfile is the source of truth — it records the exact version sitting in `node_modules`. Scanning the wishlist produces false positives (a range like `^1.0.0` might resolve to any of several versions) and can miss vulnerabilities in versions that satisfy the range but are newer than what's actually installed.

**`deep: 5` rationale:**

The depth limit of 5 is a deliberate sweet spot for MERN stacks, which commonly nest as `ProjectRoot > client > (or server >) package-lock.json`. Going deeper risks catching `node_modules`-internal lockfiles in edge cases. Going shallower misses legitimate nested workspace structures.

---

## Phase 2 — The Extraction Engine

**File:** `core/extractor/index.js`  
**Test:** `core/extractor/tests/extractor.test.js` (34 assertions)

**Input:** `Array<{ project: string, lockfilePath: string }>`  
**Output:** `{ uniqueDeps: Dep[], invertedIndex: Record<string, string[]> }`

The extractor opens every lockfile, traverses the full dependency tree (including transitive dependencies), deduplicates across projects, and produces two structures for Phase 3:

- `uniqueDeps` — every unique `name@version` found across all projects, with a `dev` flag
- `invertedIndex` — a lookup map from `name@version` → `["projectA", "projectB", ...]`

### The Inverted Index

Without the inverted index, each project would be scanned independently. If ten projects all use `lodash@4.17.21`, that's ten OSV API calls for the same result. The inverted index consolidates everything first: `lodash@4.17.21` is sent to OSV exactly once, and the result is then attributed back to all ten projects via the index.

```
After Phase 2:
{
  uniqueDeps: [
    { name: "lodash", version: "4.17.21", dev: false },
    { name: "express", version: "4.19.2",  dev: false },
    ...
  ],
  invertedIndex: {
    "lodash@4.17.21": ["jobseeker-backend", "miqat", "sentinel-middleware"],
    "express@4.19.2":  ["jobseeker-backend"],
    ...
  }
}
```

This inversion is the primary optimisation layer. At 14 projects sharing ~2,000 unique packages, the difference between inverted and non-inverted scanning can be thousands of redundant API calls.

### Schema Detection and Parsing Strategy

The extractor detects the lockfile format by inspecting the JSON keys:

```js
function parseLockfile(lockfile) {
  if (lockfile.packages) return parseV3(lockfile.packages); // npm v7+
  if (lockfile.dependencies) return parseV1(lockfile.dependencies); // npm v5/v6
  return [];
}
```

**v3 parsing (`parseV3`):** npm v7+ produces a flat `packages` object keyed by install path, e.g. `"node_modules/express"`. The parser splits on `node_modules/` to extract the package name and reads `version` and `dev` directly from the entry metadata.

**v1 parsing (`parseV1`) — Depth-First Search:** npm v5/v6 stores dependencies as a nested tree — Express's sub-dependencies are nested under Express's entry, their sub-dependencies nested under those, and so on. A flat loop reading only top-level keys would find `express` and `mongoose` but miss everything they depend on.

DFS recurses into every `dependencies` object it encounters:

```
express@4.19.2
├── body-parser@1.20.2
│   └── bytes@3.1.2
│       └── ms@2.1.3          ← 4 levels deep — found by DFS
└── debug@4.3.4
    └── ms@2.1.3               ← same package, different branch
                                  deduplicated to one entry in uniqueDeps
```

Without DFS, the inventory has 20–30 packages per project. With DFS it has 200–600+. The OSV database does not care that you never explicitly installed `ms` — if it has a known vulnerability, your application is affected.

**Deduplication via Map + Set:**

The `buildInventory` function accumulates results using an internal `Map` keyed by `name@version`. Each entry holds a `Set` of project names. This means `ms@2.1.3` encountered in two branches of the same lockfile, and again in a second project's lockfile, produces exactly one entry in `uniqueDeps` and one entry in `invertedIndex` with both projects listed.

```js
// Internal accumulation
const invertedMap = new Map();
// key: "ms@2.1.3"  value: { projects: Set(["projectA", "projectB"]), dev: false }

// Serialised output
uniqueDeps:    [{ name: "ms", version: "2.1.3", dev: false }]
invertedIndex: { "ms@2.1.3": ["projectA", "projectB"] }
```

### The Test Suite

The extractor test (`npm run extract:test`) runs 34 assertions against a hand-crafted mock lockfile that covers the cases the production data must handle:

- **Total count:** 20 unique packages with `ms@2.1.3` deduplicated across two branches
- **DFS depth:** packages at levels 2, 3, and 4 are all found
- **Deduplication:** `ms@2.1.3` appears in two tree branches — must produce exactly one `uniqueDeps` entry
- **Dev flag:** `dev: true` propagates correctly through all nesting levels
- **Scoped packages:** `@babel/core` and `@babel/parser` — names containing `/` are handled
- **Leaf nodes:** packages with no sub-dependencies don't crash the recursion
- **Inverted index:** every package maps correctly to `["test-project"]`

---

## Phase 3 — The Scanner

**Files:** `core/scanner/`  
**Input:** `{ uniqueDeps, invertedIndex }` from Phase 2  
**Output:** `VulnResult[]` sorted by severity

The scanner is a production-grade dependency auditing engine. It implements a two-pass detection architecture, a resilient TTL cache with atomic writes, CVSS 3.1 severity normalisation, and false-secure protection.

### Two-Pass Detection Architecture

Sending every dependency directly to a full advisory fetch would be wasteful — the vast majority of packages have no known vulnerabilities. The two-pass design keeps network usage proportional to the number of vulnerabilities found rather than the number of dependencies scanned.

**Pass 1 — Detection (`detect.js`)**

All unique dependencies are checked against OSV using the `/v1/querybatch` endpoint. This is a lightweight batch API: it accepts up to 1,000 package queries per request and returns only a list of Advisory IDs for packages with known issues — no severity data, no summaries. Clean packages cost nothing beyond the batch call.

```
toScan (2,021 deps)
    │
    ├── cache hits: 1,900 (no API call)
    │
    └── cache misses: 121 → split into chunks of 1,000
            │
            ├── Chunk 1 → POST /v1/querybatch (concurrent)
            └── ... all chunks fire simultaneously via Promise.all
                    │
                    └── result: pending[] = [{ dep, advisoryId }]
```

All chunks are dispatched simultaneously using `Promise.all`. No chunk waits for another to complete. If a batch request fails after all retries, the affected packages move to a `scanErrors` list rather than being silently dropped.

**Pass 2 — Enrichment (`enrich.js`)**

Only packages flagged in Pass 1 are enriched. Advisory IDs are deduplicated before fetching — the same advisory affecting multiple packages triggers one fetch, not many. Full advisory metadata (severity label, CVSS vector, summary) is fetched from `/v1/vulns/{id}`.

Concurrency is capped at 15 simultaneous requests via a zero-dependency semaphore (`core/utils/semaphore.js`). This prevents `EMFILE` errors when hundreds of advisories need fetching and avoids triggering OSV rate limiting.

### Resilient TTL Cache

`core/cache/index.js` eliminates redundant API calls across consecutive scans. Both detection results and full advisory details are cached with a 24-hour TTL. All lookups are O(1) Map operations regardless of cache size.

**Two cache namespaces:**

```
osv_{name}@{version}   → detection result from Pass 1   (TTL: 24h)
adv_{GHSA-id}          → full advisory detail from Pass 2 (TTL: 24h)
```

**Atomic writes:** All writes use a two-step flush to prevent cache corruption. Data is first serialised to `cache.json.tmp`, then `fs.rename()` atomically replaces `cache.json`. This operation either completes fully or fails without touching the original — `JSON.parse` never encounters a half-written file after a crash or Ctrl+C.

**Serial write queue:** Detection and enrichment flushes can occur concurrently during a scan. A `_flushChain` (serial promise chain) ensures each flush waits for the previous one before writing. Without this, two concurrent writers would race for the same `.tmp` file.

**Automatic pruning:** `clearCache()` deletes entries older than 7 days before flushing. This keeps `cache.json` lean over months of scanning without manual maintenance. Pass `{ force: true }` to wipe all entries regardless of age.

**`cache.json` is gitignored.** It is machine-specific, regenerated on every scan, and may contain detailed vulnerability data that should not appear in version history.

### Severity Normalisation

OSV advisory data is structurally inconsistent across databases and ecosystems. The scanner normalises all results to a five-tier scale via a three-path resolution chain. Paths are evaluated in order; the first match wins.

**Path 1 — Direct label:** `database_specific.severity` at the root of the advisory. Most common for npm packages sourced from the GitHub Advisory Database. Covers the majority of advisories with a simple string lookup.

**Path 2 — Nested label:** `affected[].database_specific.severity` inside the affected-package array. Used by some non-GitHub OSV ecosystem sources.

**Path 3 — CVSS 3.1 vector math:** If neither label path returns a value, the scanner extracts the CVSS V3 vector string and implements the official CVSS 3.1 Base Score formula:

```
ISC_base = 1 − (1 − C) × (1 − I) × (1 − A)

ISC = 6.42 × ISC_base                                     [Scope Unchanged]
ISC = 7.52 × (ISC_base − 0.029) − 3.25 × (ISC_base − 0.02)^15  [Scope Changed]

ESC = 8.22 × AV × AC × PR × UI

Score = min(ISC + ESC, 10)         [Scope Unchanged]
Score = min(1.08 × (ISC + ESC), 10) [Scope Changed]
```

Result is rounded up to one decimal place per the CVSS Roundup rule.

**Why only CVSS V3, not V2 or V4?**

CVSS V2 uses different metric keys (`Au` instead of `PR`, `Complete/Partial/None` instead of `H/L/N`). V4 uses an entirely different lookup-table scoring model. Feeding either format into the V3 formula produces silently wrong scores — a Critical advisory could be labelled Low. Advisories without a V3 vector or plain-text label resolve to `Unknown`, which is honest rather than wrong.

**Score-to-label mapping:**

| Score Range | Label    | Icon | Meaning                     |
| ----------- | -------- | ---- | --------------------------- |
| 9.0 – 10.0  | Critical | 🔴   | Immediate action required   |
| 7.0 – 8.9   | High     | 🟠   | Fix in next release         |
| 4.0 – 6.9   | Moderate | 🟡   | Schedule for remediation    |
| 0.1 – 3.9   | Low      | 🟢   | Monitor and track           |
| —           | Unknown  | ⚪   | No label or V3 vector found |

### Network Resilience

**Exponential backoff (`core/utils/retry.js`):** All OSV API calls are wrapped in a `withRetry` handler. On a 5xx server error the request is retried up to 3 times with increasing delays: 500ms → 1,000ms → 2,000ms. 4xx errors are not retried — they indicate a client-side problem (malformed request, unknown advisory ID) rather than a transient server fault.

**False-secure protection:** A network failure during detection does not produce an empty or misleading report. Batch failure after retries: all packages in the failed chunk are added to `scanErrors` and appear in the final report as `SCAN_ERROR` rows with severity `Unknown`. Advisory enrichment failure: the advisory receives an `Unknown` stub so the package still appears rather than disappearing silently.

### Scanner Module Responsibilities

| Module        | Responsibility                                                            |
| ------------- | ------------------------------------------------------------------------- |
| `index.js`    | Orchestrates Pass 1 → Pass 2 → mapper → sort                              |
| `detect.js`   | Pass 1: resolve cache, dispatch concurrent OSV batches, cache new results |
| `enrich.js`   | Pass 2: resolve cache, fetch full advisories via semaphore                |
| `osv.js`      | HTTP client: `fetchOSVBatch` (POST) and `fetchFullAdvisory` (GET)         |
| `severity.js` | Three-path severity resolution: label → nested label → CVSS 3.1 math      |
| `mapper.js`   | Translates raw OSV advisory + dep context → normalised `VulnResult`       |

### Performance

Measured across 14 projects, 2,021 unique dependencies, 1,002 scanned in prod mode:

| Scan Path         | Before | After | Improvement |
| ----------------- | ------ | ----- | ----------- |
| Cold (API)        | 7.09s  | 5.23s | 26%         |
| Warm (full cache) | 0.71s  | 0.12s | 83%         |

The cache improvement (83%) comes from replacing blocking synchronous disk I/O with async writes and eliminating redundant API calls on warm runs. The API improvement reflects concurrent chunk dispatch replacing a sequential waterfall. The remaining ~5 seconds on cold runs is OSV network latency — outside the scanner's control.

### Logging

Every log line identifies its source so the split between cache and network is always visible:

```
[scanner] Mode    : prod
[scanner] To scan : 1002 of 2021 unique deps
[scanner] Cache   : 995 valid / 7 expired / 1002 total

[cache] 995 detection result(s) loaded — no API call
[api]   Dispatching 1 batch(es) concurrently
[api]   Batch 1/1 → POST /v1/querybatch (7 packages)
[cache] 7 detection result(s) stored
[cache] 84 advisory detail(s) loaded — no API call
[api]   Fetching 7 advisory detail(s) → GET /v1/vulns/{id}
[cache] 7 advisory detail(s) stored

[scanner] ✅ Scan complete — 91 vulnerability(s) found
```

`[cache]` — disk read or write, no network. `[api]` — HTTP call to OSV.

---

## Phase 4 — The Reporter

**Files:** `core/reporter/`  
**Input:** `VulnResult[]` from Phase 3  
**Output:** CLI output, `report.html`, and/or PDF email attachment

The reporter transitions the pipeline from raw data retrieval to human-centric communication. It is split into a pure aggregation layer and three output renderers. All renderers consume the same `ReportData` object produced by `aggregate.js`, which guarantees metric consistency across channels.

### Unified Data Aggregation (`aggregate.js`)

`aggregate.js` is a pure function — no I/O, no side effects. It takes `VulnResult[]` and produces a single `ReportData` object:

```js
{
  scannedAt: "2024-11-18T07:00:00.000Z",   // ISO 8601
  meta: {
    totalProjects: 14,
    totalScanned: 1002,
    totalVulnerabilities: 91,
  },
  counts: { Critical: 3, High: 22, Moderate: 58, Low: 8, Unknown: 0 },
  groups: [
    {
      severity: "Critical",
      icon: "🔴",
      count: 3,
      items: [
        {
          package: "axios", version: "1.13.5", advisory: "GHSA-3p68-rc4w-qgx5",
          summary: "Server-Side Request Forgery in axios",
          projects: ["jobseeker-backend", "miqat"],
          dev: false
        }
      ]
    },
    ...
  ]
}
```

**Project union logic:** `totalProjects` is derived from a `Set` union of all project names that appear in at least one vulnerability. If a second `projectCount` is passed from the crawler (i.e. the total number of lockfiles found), that value takes precedence — useful for reporting that X of Y projects are affected.

**Severity grouping and pruning:** Groups follow the canonical `SEVERITIES` order from config. Severities with zero findings are automatically pruned from the `groups` array, reducing visual noise in both the CLI and HTML renderers.

### CLI Renderer (`core/reporter/cli/cli.js`)

A presentational module that writes a structured, colour-coded summary to stdout. Consumes `ReportData` and emits nothing else — it has no knowledge of the network, disk, or other renderers.

```
═══════════════════════════════════════
  Vulnerability Report
═══════════════════════════════════════
  Projects : 14
  Scanned  : 1002 unique dependencies
  Found    : 91 vulnerability(s)
═══════════════════════════════════════

  Summary
  ───────────────────────────────────
  🔴  Critical    : 3
  🟠  High        : 22
  🟡  Moderate    : 58
  🟢  Low         : 8
═══════════════════════════════════════

🔴  CRITICAL — 3 issue(s)
────────────────────────────────────────────────────────────
  📦 axios@1.13.5
     Server-Side Request Forgery in axios
     Advisory : GHSA-3p68-rc4w-qgx5
     Projects : jobseeker-backend, miqat
```

### HTML Dashboard (`core/reporter/dashboard/`)

Produces a self-contained, single-file interactive HTML report with no external dependencies. The dashboard is driven by a global `DATA` object serialised into the document — the client-side JavaScript reads this JSON at page load and handles all filtering and sorting in memory.

**Design token system (`themes/dark.js`):** All colours are defined as a theme object and mapped to CSS custom properties via `getStyles()`. This means the entire dark palette — card backgrounds, severity badge colours, accent colours — can be updated in one place.

**Interactive features:**

- Column sorting: Severity, Package name, Advisory ID, Project count (ascending/descending)
- Severity filter buttons: toggle any combination of Critical/High/Moderate/Low/Unknown
- Free-text search: matches package name, advisory ID, or summary text
- Project dropdown: filter to vulnerabilities affecting a specific project
- Prod/Dev toggle: filter by dependency type
- Projects tab: ranked breakdown of which projects have the most vulnerabilities, with a proportional bar chart and per-severity chips

**`escape.js` duplication note:** The server-side `escHtml` function in `escape.js` and the `esc` function inside `client.js` are intentionally duplicated. `client.js` is injected into the browser at runtime and cannot import Node modules. `escape.js` is the single source of truth for server-side rendering; `client.js` carries its own copy because the two execution environments are different.

### Email System (`core/reporter/mailer/`)

**Email body (`email-body.js`):** Produces a lightweight HTML summary email compatible with restrictive clients (Outlook, Gmail, Apple Mail). Uses table-based layouts and fully inlined CSS — no external stylesheets, no JavaScript. Includes a plain-text fallback via `buildPlainText()` for clients that disable HTML rendering.

The email body is intentionally minimal: project count, dependency count, severity breakdown cards, and a status pill (red for vulnerabilities found, green for clean). Full vulnerability details are deferred to the PDF attachment to keep email weight low.

**PDF generation (`pdf.js`, `pdf-report.js`):** The PDF is generated by Puppeteer — it renders a dedicated static HTML template and uses the browser's print engine to produce a properly formatted A4 document. The PDF template is entirely separate from the interactive dashboard: no search inputs, no filter buttons, no JavaScript. Vulnerabilities are grouped by severity in fixed-layout tables with `word-break: break-word` on every cell to prevent overflow.

Column widths are tuned for A4 with 16mm side margins:

```
Severity: 10% · Package: 18% · Advisory: 17% · Summary: 33% · Projects: 22%
```

`--no-sandbox` and `--disable-dev-shm-usage` are required for GitHub Actions (Ubuntu runners, no root sandbox, limited `/dev/shm`). `printBackground: true` is required — without it Chromium strips all background colours and the dark theme renders as a blank white page.

**Why two separate HTML templates?**

The interactive dashboard and the PDF use entirely different rendering modes. The dashboard is a rich web application with JavaScript-driven filtering. The PDF is a static print document where JavaScript is meaningless and interactive controls create layout artefacts. Sharing the template would mean either crippling the dashboard or producing a broken PDF.

**Mailer (`mailer.js`):** A lazy Nodemailer transporter initialised on first use. Subject line is context-aware:

```
⚠️ dep-scanner: 91 vulns found (25 critical/high)   — when vulnerable
✅ dep-scanner: all 1002 dependencies clean          — when clean
```

### Output Mode Matrix

| `REPORT_TYPE` | CLI stdout | `report.html` | PDF email |
| ------------- | ---------- | ------------- | --------- |
| `cli`         | ✓          |               |           |
| `html`        |            | ✓             |           |
| `email`       |            |               | ✓         |
| `both`        | ✓          | ✓             | ✓         |

All outputs are written before the process exits — a non-zero exit code from CI never means a lost report.

---

## Phase 5 — GitHub Actions CI

**File:** `.github/workflows/scan.yml`

Runs on a weekly schedule (every Monday at 07:00 UTC) and on manual trigger via the GitHub UI. Severity-gated exit codes make the vulnerability state visible directly in the Actions dashboard.

### Triggers

```yaml
on:
  schedule:
    - cron: "0 7 * * 1" # Every Monday at 07:00 UTC
  workflow_dispatch: # "Run workflow" button — requires authentication
```

### Concurrency

```yaml
concurrency:
  group: dep-scanner
  cancel-in-progress: false
```

`cancel-in-progress: false` means a queued run waits rather than being dropped. No scan result is ever silently lost.

### Exit Codes and CI Semantics

```
0  — scan complete, no Critical or High vulnerabilities found  → workflow stays green
1  — Critical or High vulnerabilities found                    → workflow turns red
1  — unrecoverable pipeline error
```

The threshold is Critical + High. Moderate and Low vulnerabilities are informational — they warrant review but should not block CI pipelines. Critical and High are active risks requiring immediate action.

The exit logic runs after all outputs are written:

```js
if (process.argv[2] === "scan") {
  runScan().then(({ report }) => {
    const blocking = (report.counts.Critical ?? 0) + (report.counts.High ?? 0);
    if (blocking > 0) process.exit(1);
    process.exit(0);
  });
}
```

### Puppeteer Cache Step

Puppeteer downloads Chromium (~170MB) as an npm postinstall script. Without caching, every run spends ~60 seconds on the download. The workflow caches `~/.cache/puppeteer` keyed on the lockfile hash:

```yaml
- name: Cache Puppeteer Chromium
  uses: actions/cache@v4
  with:
    path: ~/.cache/puppeteer
    key: ${{ runner.os }}-puppeteer-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-puppeteer-
```

`PUPPETEER_CACHE_DIR` must be set explicitly on both the install step and the scan step. Without it, Puppeteer's postinstall script and the runtime process may resolve different default paths on the runner, making the cache hit useless.

```yaml
- name: Install dependencies
  env:
    PUPPETEER_CACHE_DIR: /home/runner/.cache/puppeteer
  run: npm ci

- name: Run vulnerability scan
  env:
    PUPPETEER_CACHE_DIR: /home/runner/.cache/puppeteer
    SEARCH_PATH: ${{ github.workspace }}
    REPORT_TYPE: both
    SCAN_MODE: all
    SMTP_HOST: ${{ secrets.SMTP_HOST }}
    # ... other secrets
  run: node core/index.js scan
```

### HTML Artifact Upload

```yaml
- name: Upload HTML report
  if: success() || failure()
  uses: actions/upload-artifact@v4
  with:
    name: vulnerability-report-${{ github.run_id }}
    path: report.html
    retention-days: 30
    if-no-files-found: warn
```

`success() || failure()` rather than `always()`: if the job is cancelled mid-run (timeout fires, manual cancel), GitHub marks the job as "cancelled", not "failed". `always()` would attempt to upload a report that was never fully written. `success() || failure()` correctly skips the upload on cancellation.

### Required Secrets

Set these under _Settings → Secrets and variables → Actions_:

| Secret        | Description                               | Example               |
| ------------- | ----------------------------------------- | --------------------- |
| `SMTP_HOST`   | SMTP server hostname                      | `smtp.gmail.com`      |
| `SMTP_PORT`   | SMTP port (587 for STARTTLS, 465 for TLS) | `587`                 |
| `SMTP_SECURE` | `"true"` for port 465, empty for 587      |                       |
| `SMTP_USER`   | Sender email address                      | `you@gmail.com`       |
| `SMTP_PASS`   | App password or SMTP password             | `xxxx xxxx xxxx xxxx` |
| `REPORT_TO`   | Recipient address(es), comma-separated    | `team@company.com`    |

---

## Shared Utilities

### `core/utils/chunk.js` — `chunkArray(arr, size)`

Splits a flat array into sub-arrays of a fixed maximum length. The final chunk may be smaller than `size` if the total length is not a perfect multiple. Used to split the full `uniqueDeps` list into OSV's 1,000-query batch limit.

```js
chunkArray([1, 2, 3, 4, 5], 2); // → [[1, 2], [3, 4], [5]]
```

### `core/utils/retry.js` — `withRetry(fn, opts)`

Exponential-backoff retry wrapper for async operations. Calls `fn(attempt)` up to `maxRetries + 1` times. Only retries when `isRetryable(err)` returns true — 4xx client errors are not retried, only transient 5xx server faults and network errors. Delays double each attempt: 500ms → 1,000ms → 2,000ms by default.

`fn` receives the current attempt index (0-based) so callers can log "retrying (attempt 2)" without maintaining an external counter.

### `core/utils/semaphore.js` — `createSemaphore(limit)`

Zero-dependency concurrency limiter. Returns a `run(fn)` wrapper that allows at most `limit` async functions to execute simultaneously. Excess calls are queued and fire as active slots free. Used in `enrich.js` to cap concurrent OSV advisory fetches at 15, preventing `EMFILE` errors and avoiding rate limiting.

```js
const run = createSemaphore(15);
const results = await Promise.all(ids.map((id) => run(() => fetch(id))));
```

---

## Running & Testing

### Prerequisites

```bash
node --version  # 20.x or later
npm install
```

### Run a full scan

```bash
npm run core
# → nodemon core/index.js scan
```

Output channel(s) are determined by `REPORT_TYPE` in config or the `REPORT_TYPE` environment variable.

### Run the Phase 2 extractor test suite

```bash
npm run extract:test
# → 34 assertions covering: total count, DFS depth, deduplication,
#   dev flag propagation, scoped packages, inverted index correctness
```

Exit code 1 if any assertion fails.

### Force a full re-scan (bypass cache)

```bash
# Windows
del core\cache\cache.json

# macOS / Linux
rm core/cache/cache.json

npm run core
```

### Switch scan scope

In `config/scanner.config.js` (or via environment variable):

```js
export const SCAN_MODE = "prod"; // skips dev dependencies
export const SCAN_MODE = "all"; // includes dev dependencies
```

Prod mode on 2,021 unique deps reduces the scan to ~1,002 packages — roughly half, since MERN projects tend to have large dev dependency trees (Jest, ESLint, Babel, Playwright, Vite, etc.).

### Trigger the GitHub Actions workflow manually

Actions tab → Dependency Vulnerability Scan → Run workflow → Run workflow.

The CLI log is visible in real time under the "Run vulnerability scan" step. The HTML report is downloadable from Summary → Artifacts after the run completes.

---

## Engineering Decisions

| Decision                                         | Alternative Considered               | Rationale                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scan `package-lock.json`, not `package.json`     | `package.json` version ranges        | Lockfile has exact installed versions — ranges produce false positives and can miss vulnerabilities in resolved versions                               |
| DFS for v1 lockfiles                             | Flat top-level loop                  | Completeness — transitive dependencies at any depth are captured; a flat loop misses everything beyond the first level                                 |
| Inverted index (Hash Map + Set)                  | Scan each project independently      | A package shared by N projects is queried once, not N times; reduces API calls proportional to project overlap                                         |
| Two-pass scanner (detect then enrich)            | Single pass with full advisory fetch | The batch detection API returns only advisory IDs, not severity or summaries — a second pass is required by the OSV API design                         |
| `fast-glob` over custom recursive walk           | `fs.readdirSync` loop                | Concurrent async I/O, built-in glob patterns, depth control — solved problem; the crawler is infrastructure                                            |
| Pure `aggregate.js` layer                        | Each renderer derives its own totals | Eliminates metric drift — CLI, HTML, and PDF always show identical counts                                                                              |
| Separate PDF template (`pdf-report.js`)          | Reuse the interactive dashboard HTML | The PDF engine renders interactive controls as broken UI; a static print template is required for a correct document                                   |
| `escHtml` duplicated in `client.js`              | Threading `escHtml` as an argument   | `client.js` runs in the browser — it cannot import Node modules; the server-side copy in `escape.js` remains the canonical definition                  |
| Atomic cache writes (`.tmp` + `rename`)          | Direct `writeFile` to `cache.json`   | `fs.rename()` is atomic at the OS level; a crash or Ctrl+C during a direct write produces a half-written file that breaks `JSON.parse` on the next run |
| Serial flush queue (`_flushChain`)               | Concurrent flush calls               | Two concurrent flushes would race for the same `.tmp` file — one would silently overwrite the other                                                    |
| Semaphore on advisory fetches                    | Unbounded `Promise.all`              | `EMFILE` (too many open files) at 200+ simultaneous fetches; the semaphore caps at 15                                                                  |
| Exponential backoff (3 retries, 500ms base)      | Immediate retry or no retry          | Transient 5xx faults need time to recover; immediate retries hammer a struggling server; no retries produce false-secure reports                       |
| `success() \|\| failure()` on artifact upload    | `always()`                           | Cancelled jobs (timeout/manual) produce no complete `report.html`; uploading a partial artefact is misleading                                          |
| `cancel-in-progress: false` on concurrency       | `cancel-in-progress: true`           | Queued runs wait rather than being dropped — no scan result is silently lost                                                                           |
| Severity threshold at Critical + High for exit 1 | Any vulnerability triggers exit 1    | Moderate/Low are informational; blocking CI on them creates noise and encourages dismissal; Critical/High require immediate action                     |
| `PUPPETEER_CACHE_DIR` explicit on both steps     | Default Puppeteer path resolution    | Runner default paths can diverge between install and runtime, making the cache hit deliver nothing                                                     |
| CVSS V3 only in vector parser                    | Parse V2 and V4 as well              | V2 and V4 use different metric keys and formulas — feeding them into the V3 formula produces silently wrong scores; `Unknown` is honest                |

---

## Import Rules

These rules are enforced by convention. Breaking them couples layers that change for different reasons.

```
config/    →  imported by core/ modules only
core/      →  imported by CLI entry point and future server routes
utils/     →  imported by scanner/ and reporter/ — never by config/
themes/    →  imported by reporter/ renderers only
```

`core/index.js` is the only file permitted to import across all phases. It is the pipeline orchestrator and the only place where Phase 1, 2, 3, and 4 are wired together. All other files import only from their own phase or from `utils/` and `config/`.

```js
// core/index.js — the full pipeline in four imports
import { scanProjects }  from "./crawler/index.js";    // Phase 1
import { buildInventory } from "./extractor/index.js"; // Phase 2
import { queryOSV }       from "./scanner/index.js";   // Phase 3
import { aggregate }      from "./reporter/aggregate.js"; // Phase 4

export async function runScan() {
  const lockfiles  = await scanProjects();
  const inventory  = buildInventory(lockfiles);
  const vulns      = await queryOSV(inventory);
  const report     = aggregate(vulns, { ... });
  // → render to CLI / HTML / PDF
  return { report, html };
}
```

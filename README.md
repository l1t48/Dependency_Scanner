# dep-scanner

A cross-project dependency vulnerability scanner for MERN codebases.

This README documents the **core engine only** — a pure Node.js pipeline with no server, no dashboard, and no email. Those layers come later. The engine is the foundation everything else builds on.

---

## What this is (and what it isn't yet)

The core engine is a standalone Node.js script. You run it, it scans your projects, it gives you a categorised vulnerability report. That's it.

It does **not** have:

- An HTTP server
- A dashboard
- Email reporting
- GitHub Actions automation

Those are Phases 4–5. Phases 1–3 are done.

---

## Project structure (current)

```
dep-scanner/
├── config/
│   └── scanner.config.js       # WHAT to scan and HOW — user values only
├── core/
│   ├── crawler/
│   │   └── index.js            # Phase 1: finds every package-lock.json
│   ├── extractor/
│   │   ├── index.js            # Phase 2: DFS parser + inverted index
│   │   └── test.js             # Phase 2: 34-assertion test suite
│   ├── scanner/
│   │   ├── chunk.js            # splits deps into batches of 1,000
│   │   ├── osv.js              # HTTP calls to OSV API
│   │   ├── severity.js         # CVSS parsing + score → label mapping
│   │   ├── mapper.js           # OSV advisory → VulnResult shape
│   │   ├── detect.js           # Phase 3 Pass 1: batch detection
│   │   ├── enrich.js           # Phase 3 Pass 2: full advisory enrichment
│   │   └── index.js            # Phase 3 orchestrator
│   ├── cache/
│   │   └── index.js            # 24h JSON cache — skip repeated API calls
│   ├── reporter/
│   │   └── print.js            # CLI output — severity-grouped report
│   └── index.js                # Engine entry point — orchestrates all phases
├── package.json
└── README.md
```

As each phase is completed, `core/` will grow:

```
core/
├── crawler/      ← Phase 1  (done)
├── extractor/    ← Phase 2  (done)
├── scanner/      ← Phase 3  (done)
├── cache/        ← Phase 3  (done)
├── reporter/     ← Phase 4  (next — email)
└── index.js      ← orchestrator
```

---

## How the engine is called

Three different callers, one function:

```
CLI (manual / GitHub Actions)  →  node core/index.js scan
Server route (dashboard)       →  import { runScan } from "./core/index.js"
```

```js
// core/index.js
import { scanProjects } from "./crawler/index.js";
import { buildInventory } from "./extractor/index.js";
import { queryOSV } from "./scanner/index.js";
import { printReport } from "./reporter/print.js";

export async function runScan() {
  const lockfiles = await scanProjects(); // Phase 1
  const inventory = buildInventory(lockfiles); // Phase 2
  const report = await queryOSV(inventory); // Phase 3
  // await sendReport(report);                  // Phase 4 — coming next
  printReport(report);
  return report;
}
```

---

## Phase 1 — The Crawler

**Goal:** Find every `package-lock.json` in your projects folder and return their paths.

**Why `package-lock.json` and not `package.json`**

`package.json` is a wishlist. The lockfile is the source of truth — it contains the exact version sitting in `node_modules`. Scanning the wishlist means false positives, or missed vulnerabilities.

**Why `fast-glob` over a custom algorithm**

`fast-glob` issues directory reads concurrently using async I/O. A hand-rolled `fs.readdirSync` loop is synchronous and blocking — it reads one directory at a time and blocks the event loop while it waits. With 14 projects and hundreds of nested directories, the difference is significant. The crawler is infrastructure, not the interesting part of this project.

### Configuration — `config/scanner.config.js`

Only user-configurable values live here. Internal constants (TTL, chunk size, API URLs, sort order) live in the modules that use them.

```js
export const SEARCH_PATH = "E:/Projects";

export const IGNORE_LIST = [
  "**/node_modules/**",
  "**/React-Learning-Simple-Projects/**",
  "**/dist/**",
  "**/build/**",
  "**/temp/**",
];

export const CRAWLER_OPTIONS = {
  deep: 5, // sweet spot for MERN: reaches Project > client > package-lock.json
  onlyFiles: true,
};

// "all"  → scan every dependency including dev tools
// "prod" → scan only production dependencies
export const SCAN_MODE = "all";
```

**Rule:** Values that change between machines → `scanner.config.js`. Secrets → `.env`. Internal implementation constants → the module that uses them.

### The crawler — `core/crawler/index.js`

Returns `{ project, lockfilePath }` objects. Phase 2 needs the project name to build the inverted index — a bare path is not enough. The crawler never reads lockfile contents — its only job is to find and label them.

---

## Phase 2 — The Extraction Engine

**Goal:** Open every lockfile, traverse the full dependency tree, and produce a global inventory — one deduplicated list of every installed package, and a map of which projects use each one.

### Why DFS and not a flat loop

A flat loop reads only top-level dependencies — it finds `express` and stops. DFS recurses into every dependency's dependencies, reaching packages you never installed yourself.

```
express@4.19.2
├── body-parser@1.20.2
│   └── bytes@3.1.2
│       └── ms@2.1.3    ← you never installed this — DFS finds it
└── debug@4.3.4
    └── ms@2.1.3         ← same package, different branch — deduplicated to one entry
```

With a flat loop the inventory has ~20–30 packages per project. With DFS it has 200–600+. The OSV database does not care that you didn't install `ms` directly — if it has a known vulnerability, your application is affected.

### The Inverted Index

Instead of scanning Project A, then Project B separately, everything is consolidated into one map first:

```js
{ "lodash@4.17.21": ["jobSeeker_backend", "jobSeeker_frontend", "Miqat"] }
```

This means `lodash@4.17.21` is sent to OSV exactly once, regardless of how many projects share it. Without the inverted index, 10 projects sharing the same 500 dependencies would mean 5,000 OSV queries. With it, it's 500.

### Testing Phase 2

```bash
npm run extract:test
# → 34 assertions: depth, deduplication, dev flags, scoped packages, inverted index
```

The critical assertion: `ms@2.1.3` exists in two separate branches of the dependency tree. The test confirms it appears exactly once in `uniqueDeps`.

---

## Phase 3 — The Scanner

**Goal:** Check every unique dependency against the OSV vulnerability database and return a categorised list of vulnerabilities.

### The two-pass design

The OSV batch API (`POST /v1/querybatch`) is a detection API — it tells you which advisories apply to a package, but returns only abbreviated `{ id, modified }` objects. There is no severity, no summary, no CVSS score in the batch response.

Full advisory details require a second call to `GET /v1/vulns/{id}`.

```
Pass 1 — detect.js    → POST /v1/querybatch  → which advisories apply (abbreviated)
Pass 2 — enrich.js    → GET  /v1/vulns/{id}  → full details: severity, summary, CVSS
```

Sending everything to enrichment in parallel with `Promise.all` keeps the second pass fast — all advisory fetches fire at once rather than sequentially.

### The cache

Without caching, every run makes 2,000+ API calls. With caching, the second run makes zero.

Two key namespaces in `core/cache/cache.json`:

```
osv_{name}@{version}   — detection result from Pass 1  (TTL: 24h)
adv_{GHSA-id}          — full advisory detail from Pass 2  (TTL: 24h)
```

The cache loads once into memory on first use and flushes once per write batch. Loading and saving the entire JSON file on every package would be O(N) disk writes — loading once and flushing at the end is O(1) regardless of how many packages are processed.

**`cache.json` is in `.gitignore`.** It's machine-specific, generated on every scan, and can contain detailed vulnerability data you don't want in git history.

### Logging — cache vs API

Every log line tells you whether a result came from cache or required a network call:

```
[cache] 995 detection result(s) loaded — no API call
[api]   Batch 1/3 → POST /v1/querybatch (1000 packages)
[cache] 1000 detection result(s) stored
[cache] 47 advisory detail(s) loaded — no API call
[api]   Fetching 12 advisory detail(s) → GET /v1/vulns/{id}
[cache] 12 advisory detail(s) stored
```

`[cache]` — disk read or write, no network. `[api]` — HTTP call to OSV.

### Severity mapping — `core/scanner/severity.js`

OSV advisories expose severity through three possible paths, tried in order:

```
Path 1 — database_specific.severity           → "HIGH", "MODERATE" (GitHub Advisory label)
Path 2 — affected[].database_specific.severity → nested label in some formats
Path 3 — severity[].score                      → raw CVSS vector string, parsed to a number
```

Path 1 is a cheap string lookup and covers most npm advisories. Path 3 requires implementing the CVSS 3.x base score formula — a ~40 line deterministic calculation from the official specification. No library needed.

**Critical detail:** `parseCVSSVector` returns a **number** (e.g. `7.5`). `scoreToLabel` converts that number to a label. They are two separate functions. Passing the number directly to `scoreToLabel` is the correct pattern — do not try to access `.severity` on the numeric return value.

### The scanner modules

```
chunk.js    — splits 2000+ deps into arrays of 1,000 (OSV batch limit)
osv.js      — fetchOSVBatch (POST) and fetchFullAdvisory (GET)
severity.js — mapSeverity: CVSS parsing + score → label
mapper.js   — shapes full OSV advisory → VulnResult
detect.js   — Pass 1: check cache, query OSV batch for misses
enrich.js   — Pass 2: check cache, fetch full advisories for misses
index.js    — orchestrates the two passes, sorts by severity
```

### The CLI report — `core/reporter/print.js`

Separated from `core/index.js` so the orchestrator stays clean, and so Phase 4 (`email.js`) sits alongside it as a sibling in the same folder.

```
core/reporter/
├── print.js    ← Phase 3 (done) — CLI output
└── email.js    ← Phase 4 (next) — HTML email via Nodemailer or Resend
```

### What a successful Phase 3 output looks like

```
═══════════════════════════════════════
  dep-scanner  —  starting scan
═══════════════════════════════════════

[scanner] Mode    : all
[scanner] To scan : 2021 of 2021 unique deps
[scanner] Cache   : 2021 valid / 0 expired / 2021 total

[cache] 2021 detection result(s) loaded — no API call
[cache] 84 advisory detail(s) loaded — no API call
[api]   Fetching 7 advisory detail(s) → GET /v1/vulns/{id}
[cache] 7 advisory detail(s) stored

[scanner] ✅ Scan complete — 91 vulnerability(s) found

═══════════════════════════════════════
  Vulnerability Summary
═══════════════════════════════════════
  🔴  Critical  : 3
  🟠  High      : 22
  🟡  Moderate  : 58
  🟢  Low       : 8
═══════════════════════════════════════

🔴  CRITICAL — 3 issue(s)
────────────────────────────────────────────────────────────
  📦 axios@1.13.5
     Server-Side Request Forgery in axios
     Advisory : GHSA-3p68-rc4w-qgx5
     Projects : jobSeeker_backend, Backend
...
```

---

## Running & testing the engine

### Run the full scan

```bash
npm run core
# → nodemon core/index.js scan
```

### Run Phase 2 extractor tests

```bash
npm run extract:test
# → 34 assertions across: depth, deduplication, dev flags, scoped packages, inverted index
```

### Force a full re-scan (ignore cache)

```bash
del core\cache\cache.json   # Windows
rm core/cache/cache.json    # Mac / Linux
npm run core
```

### Switch between scan modes

In `config/scanner.config.js`:

```js
export const SCAN_MODE = "prod"; // skips all dev dependencies
```

Prod mode on 2021 deps reduces the scan to ~995 packages — roughly half, since most MERN projects have large dev dependency trees.

---

## What `runScan()` will look like when all phases are done

```js
export async function runScan() {
  const lockfiles = await scanProjects(); // Phase 1 — crawler
  const inventory = buildInventory(lockfiles); // Phase 2 — extractor
  const report = await queryOSV(inventory); // Phase 3 — scanner
  await sendReport(report); // Phase 4 — reporter (email)
}
```

`core/index.js` is the only file that will ever import from all phases.

---

## Engineering decisions

| Decision                               | Alternative                    | Why this approach                                                     |
| -------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| Scan `package-lock.json`               | Scan `package.json`            | Accuracy — lockfile has exact installed versions                      |
| Central `scanner.config.js`            | Inline constants               | Separation of user config from implementation                         |
| `fast-glob` over custom algorithm      | Hand-rolled `fs.readdir`       | Async I/O, glob patterns, depth control — solved problem              |
| Crawler returns paths only             | Crawler reads contents         | Single responsibility — finding vs. parsing                           |
| DFS for v1 lockfiles                   | Flat top-level loop            | Completeness — transitive deps at any depth are found                 |
| Inverted index (Hash Map)              | Scan each project individually | Speed — each unique package queried once                              |
| Two-pass scanner                       | One-pass with abbreviated data | Correctness — batch API has no severity data                          |
| Cache per namespace (`osv_*`, `adv_*`) | Single flat cache              | Clarity — detection results and advisory details expire independently |
| `Promise.all` for advisory enrichment  | Sequential fetch               | Performance — all advisory fetches fire in parallel                   |
| CVSS math inline                       | Third-party library            | Understanding — for a security tool, knowing the math matters         |
| `printReport` in `reporter/print.js`   | Inline in `core/index.js`      | Prepares the reporter folder for Phase 4 email alongside it           |

---

## Import rules (enforced by convention)

```
config/    →  imported by core/ only
core/      →  imported by server/ and CLI
server/    →  never imported by client/
client/    →  talks to server via HTTP only — never direct imports
```

Breaking these rules couples layers that change for different reasons.

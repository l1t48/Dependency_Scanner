# dep-scanner

A cross-project dependency vulnerability scanner for MERN codebases.

This README documents the **core engine only** — a pure Node.js pipeline with no server, no dashboard, and no email. Those layers come later and will each get their own documentation. The engine is the foundation everything else builds on.

---

## What this is (and what it isn't yet)

The core engine is a standalone Node.js script. You run it, it scans your projects, it gives you data. That's it.

It does **not** have:

- An HTTP server
- A dashboard
- Email reporting
- GitHub Actions automation

Those are Phases 3–5. Phases 1 and 2 are done.

---

## Project structure (current)

```
dep-scanner/
├── config/
│   └── scanner.config.js       # WHAT to scan and HOW to crawl
├── core/
│   ├── crawler/
│   │   └── index.js            # Phase 1: finds every package-lock.json
│   ├── extractor/
│   │   ├── index.js            # Phase 2: DFS parser + inverted index
│   │   └── test.js             # Phase 2: 34-assertion test suite
│   └── index.js                # Engine entry point — orchestrates all phases
├── package.json
└── README.md
```

As each phase is completed, `core/` will grow:

```
core/
├── crawler/      ← Phase 1  (done)
├── extractor/    ← Phase 2  (done)
├── scanner/      ← Phase 3  (next)
├── cache/        ← Phase 3
├── reporter/     ← Phase 4
└── index.js      ← orchestrator
```

The `core/index.js` file is the only place that calls each phase in sequence. Nothing outside of `core/` should call a phase directly.

---

## How the engine is called

Three different callers, one function:

```
CLI (manual / GitHub Actions)  →  node core/index.js
Server route (dashboard)       →  import { runScan } from "./core/index.js"
```

Both call `runScan()` from `core/index.js`. Neither the crawler nor the extractor knows which caller triggered them.

```js
// core/index.js
import { scanProjects } from "./crawler/index.js";
import { buildInventory } from "./extractor/index.js";

export async function runScan() {
  const lockfiles = await scanProjects(); // Phase 1
  const inventory = buildInventory(lockfiles); // Phase 2
  // Phase 3, 4 will be chained here as they are built
}

runScan().catch((err) => {
  console.error("Failed to run scan:", err);
  process.exit(1);
});
```

---

## Phase 1 — The Crawler

**Goal:** Find every `package-lock.json` in your projects folder and return their paths.

**Why `package-lock.json` and not `package.json`**

`package.json` is a wishlist. It says `"express": "^4.17.1"` — which could mean any version from 4.17.1 upward. The lockfile is the source of truth. It contains the exact version sitting in `node_modules` right now. Scanning the wishlist means false positives, or worse, missed vulnerabilities.

**Why `fast-glob`**

`fast-glob` traverses the file system using a glob pattern and returns matching paths. It is significantly faster than recursive `fs.readdir` loops because it parallelises directory reads internally. The `deep` option caps how many levels it descends, which prevents it from wandering into unrelated system folders.

---

### Why not write a custom algorithm?

This is the right question to ask. The crawler is doing file system traversal — a well-understood problem — so it is worth knowing exactly why a hand-rolled solution loses before reaching for a library.

**What a naive recursive algorithm looks like**

```js
import fs from "fs";
import path from "path";

function findLockfiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue; // manual ignore
      findLockfiles(fullPath, results); // recurse
    } else if (entry.name === "package-lock.json") {
      results.push(fullPath);
    }
  }

  return results;
}
```

This works. For a single small project it is fine. But it has four problems that compound as the codebase grows.

**Problem 1 — It is synchronous and blocking**

`fs.readdirSync` reads one directory at a time and blocks the event loop while it waits. A projects folder with 10 repos and hundreds of nested directories means hundreds of sequential disk reads. `fast-glob` issues those reads concurrently using async I/O, so the wait time is determined by the slowest single read, not the sum of all reads.

**Problem 2 — The ignore logic has to be built by hand**

The example above only ignores `node_modules` by exact name. Adding `dist`, `build`, `temp`, and scoped paths like `**/React-Learning-Simple-Projects/**` means writing and maintaining your own pattern-matching logic. Glob patterns (`**`, `*`, `?`, `{}`) are a solved standard. Reimplementing them is reinventing a wheel that already exists in battle-tested form.

**Problem 3 — Depth control does not exist**

The naive version recurses until it hits every leaf of the file system. There is no `deep: 5` equivalent without adding a counter parameter, passing it through every recursive call, and remembering to decrement it correctly. One mistake and the scanner either stops too early or wanders into system directories.

**Problem 4 — It does not scale to the rest of the pipeline**

Phase 2 will process potentially thousands of files. The crawler needs to return results as fast as possible so the extractor is not waiting on I/O. A synchronous crawler is a bottleneck at the very start of the pipeline — before any real work has even begun.

**Why `fast-glob` is the right tool here**

The crawler is not the interesting part of this project. It is infrastructure. The interesting algorithms are in Phase 2 (DFS + inverted index) and Phase 3 (interval trees + OSV batching). `fast-glob` handles the infrastructure correctly so the engineering effort goes into the parts that actually matter.

```
Custom algorithm          fast-glob
─────────────────         ─────────────────────────────────
Synchronous               Async, concurrent directory reads
Manual ignore strings     Full glob pattern support
No depth control          Built-in deep: N option
Maintain forever          One dependency, community maintained
```

The rule: write the algorithm when the problem is unique to your domain. Use the library when the problem is generic and solved. File system traversal is generic and solved.

---

### Configuration — `config/scanner.config.js`

All values that describe _your environment_ live here. The crawler imports them — it doesn't define them.

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
```

**Rule:** If a value changes between machines or environments → it belongs in `scanner.config.js`. If it's a secret or credential → it belongs in `.env`. Never mix the two.

### The crawler — `core/crawler/index.js`

```js
import fg from "fast-glob";
import path from "path";
import {
  SEARCH_PATH,
  IGNORE_LIST,
  CRAWLER_OPTIONS,
} from "../../config/scanner.config.js";

export async function scanProjects() {
  console.log("🚀 Scanning for MERN projects...");

  const pattern = `${SEARCH_PATH}/**/package-lock.json`;

  const entries = await fg(pattern, {
    ignore: IGNORE_LIST,
    ...CRAWLER_OPTIONS,
  });

  console.log(`\n✅ Found ${entries.length} projects:`);
  entries.forEach((file) => console.log(`- ${path.dirname(file)}`));

  // Returns { project, lockfilePath } objects — Phase 2 needs the project name
  // to build the inverted index. A bare file path does not contain it.
  return entries.map((file) => ({
    project: path.basename(path.dirname(file)),
    lockfilePath: file,
  }));
}
```

The crawler returns `{ project, lockfilePath }` objects. Phase 2 needs the project name to build the inverted index — a bare file path alone is not enough. The crawler itself never reads the lockfile contents — its only job is to find and label them.

---

## Phase 2 — The Extraction Engine

**Goal:** Open every lockfile the crawler found, traverse the full dependency tree, and produce a clean global inventory — one deduplicated list of every package installed across all projects, and a map showing which projects use each one.

---

### Why DFS and not a flat loop?

When you install `express`, npm installs express and everything express depends on. Those dependencies have their own dependencies. The full picture is a tree, not a list.

```
express@4.19.2
├── body-parser@1.20.2
│   └── bytes@3.1.2
│       └── ms@2.1.3        ← you never installed this
└── debug@4.3.4
    └── ms@2.1.3             ← same package, different branch
```

A flat loop reads only the top level — it finds `express` and stops. It never sees `bytes` or `ms`. A flat loop would produce an inventory of ~20–30 packages per project. With DFS traversing the full tree, the real number is 200–600+ per project.

**Why that matters:** The OSV vulnerability database does not care that you didn't install `ms` directly. If `ms@2.1.3` has a known vulnerability, your application is affected regardless. A flat loop would miss it entirely and your report would be silently incomplete.

**DFS — "go deep first"**

DFS visits a node, then immediately recurses into its children before moving to the next sibling. In a dependency tree that means: visit `express`, recurse into `body-parser`, recurse into `bytes`, recurse into `ms`, backtrack, recurse into `debug`, recurse into `ms` again (deduplicated), backtrack, done.

```js
// v1: nested tree — the actual DFS implementation
function parseV1(dependencies, found = []) {
  for (const [name, meta] of Object.entries(dependencies)) {
    if (!meta.version) continue;

    found.push({ name, version: meta.version, dev: meta.dev ?? false });

    // This single line is the DFS — recurse before moving to the next sibling
    if (meta.dependencies) {
      parseV1(meta.dependencies, found);
    }
  }
  return found;
}
```

Without `if (meta.dependencies) { parseV1(meta.dependencies, found); }` the function only ever sees the top level. That one recursive call is what makes it a depth-first search.

**Why v3 lockfiles don't need DFS**

npm v7+ writes a flat `packages` map — every dependency is already listed at the top level regardless of nesting. The tree structure is gone. Iterating the keys is equivalent to DFS because npm already did the traversal when it wrote the lockfile.

```js
// v2/v3: flat map — no recursion needed
function parseV3(packages) {
  const deps = [];
  for (const [pkgPath, meta] of Object.entries(packages)) {
    if (!pkgPath || !meta.version) continue;
    const segments = pkgPath.split("node_modules/");
    const name = segments[segments.length - 1];
    deps.push({ name, version: meta.version, dev: meta.dev ?? false });
  }
  return deps;
}
```

The parser detects which format it's dealing with automatically:

```js
function parseLockfile(lockfile) {
  if (lockfile.packages) return parseV3(lockfile.packages); // npm v2/v3
  if (lockfile.dependencies) return parseV1(lockfile.dependencies); // npm v1
  return [];
}
```

---

### The Inverted Index

After parsing every lockfile, the extractor builds two data structures.

**The problem it solves:** Ten projects all use `lodash@4.17.21`. Without deduplication you ask OSV "is lodash safe?" ten times — once per project. The OSV API has rate limits and a maximum batch size of 1,000. Redundant queries waste both.

**The solution:** Build a single map where the key is `package@version` and the value is the set of projects that use it. Every unique package is queried exactly once regardless of how many projects share it.

```js
// During extraction — one Map accumulates across all lockfiles
const invertedMap = new Map();
// key:   "lodash@4.17.21"
// value: { projects: Set { "job-tracker", "miqat", "portfolio" }, dev: false }

// After all lockfiles — serialised to plain objects for Phase 3
{
  "lodash@4.17.21": ["job-tracker", "miqat", "portfolio"],
  "express@4.19.2": ["job-tracker"],
  "jest@29.7.0":    ["job-tracker", "portfolio"]
}
```

A `Set` is used for the project list during accumulation because the same project name can appear multiple times as different lockfiles are processed. `Set` deduplication is automatic. It is converted to an array before being returned.

**How Phase 3 uses it:** Phase 3 takes `uniqueDeps` and queries OSV once per entry. When OSV returns a vulnerability for `lodash@4.17.21`, Phase 3 looks up `invertedIndex["lodash@4.17.21"]` to find every project that is affected. Without the inverted index, Phase 3 would have to re-scan all lockfiles from scratch to answer that question.

---

### Dev vs prod flagging

The lockfile records whether each dependency is a development tool or a production dependency via a `dev` boolean. The extractor reads it and stores it on every entry:

```js
{ name: "jest",    version: "29.7.0",  dev: true  }  // testing tool
{ name: "express", version: "4.19.2",  dev: false }  // runs in production
```

Phase 3 uses this to decide priority. A critical vulnerability in `jest` is less urgent than the same vulnerability in `express` — `jest` never runs in production. The flag is captured here so Phase 3 can filter or deprioritise without re-reading the lockfiles.

---

### The extractor — `core/extractor/index.js`

```js
import { readFileSync } from "fs";

export function buildInventory(lockfiles) {
  const invertedMap = new Map();

  for (const { project, lockfilePath } of lockfiles) {
    let lockfile;
    try {
      lockfile = JSON.parse(readFileSync(lockfilePath, "utf-8"));
    } catch {
      console.warn(`⚠️  Could not read ${lockfilePath} — skipping`);
      continue;
    }

    const deps = parseLockfile(lockfile);

    for (const dep of deps) {
      const key = `${dep.name}@${dep.version}`;
      if (!invertedMap.has(key)) {
        invertedMap.set(key, { projects: new Set(), dev: dep.dev });
      }
      invertedMap.get(key).projects.add(project);
    }
  }

  // Serialise Map → plain objects for Phase 3
  const uniqueDeps = [];
  const invertedIndex = {};

  for (const [key, value] of invertedMap.entries()) {
    const atIdx = key.lastIndexOf("@");
    uniqueDeps.push({
      name: key.slice(0, atIdx),
      version: key.slice(atIdx + 1),
      dev: value.dev,
    });
    invertedIndex[key] = [...value.projects];
  }

  return { uniqueDeps, invertedIndex };
}
```

---

### Testing Phase 2

Phase 2 has a dedicated test suite that uses a hand-written mock lockfile. The mock is controlled entirely — every package, every nesting level, every branch is defined by us. This makes the assertions exact rather than approximate.

```bash
npm run extract:test
```

**What the test suite covers (34 assertions):**

| Group            | What it proves                                                   |
| ---------------- | ---------------------------------------------------------------- |
| Total count      | 20 unique packages, not 20 × number of branches                  |
| Direct prod deps | express, mongoose, axios, dotenv found and labelled correctly    |
| DFS depth        | `ms` found at 4 levels deep — express → body-parser → bytes → ms |
| Deduplication    | `ms@2.1.3` appears in two branches, stored once                  |
| Dev flag         | All dev and prod packages correctly labelled                     |
| Scoped packages  | `@babel/core` and `@babel/parser` parsed without breaking        |
| Inverted index   | Keys, values, and project names in the correct shape             |

**The test that matters most — deduplication across branches:**

```
express@4.19.2
├── body-parser → bytes → ms@2.1.3   ← DFS visits ms here
└── debug       →        ms@2.1.3   ← DFS visits ms again here
```

DFS visits `ms@2.1.3` twice. The assertion confirms it appears exactly once in `uniqueDeps`. If this fails, the `Set` deduplication is broken and Phase 3 would send duplicate queries to OSV.

---

## Running & testing the engine

### Run the full engine

```bash
npm run core
# → nodemon core/index.js (restarts on file save)
```

### Run the extractor tests

```bash
npm run extract:test
# → 34 assertions, all phases of extractor logic covered
```

### What a successful Phase 1 + 2 output looks like

```
🚀 Scanning for MERN projects...

✅ Found 14 projects:
- E:/Projects/JobSeeker/jobSeeker_backend
- E:/Projects/JobSeeker/jobSeeker_frontend
- E:/Projects/Miqat
...

✅ DFS working — found transitive dep: bytes@3.1.2
   Used by: Ink_And_Insights_frontend, jobSeeker_backend

Total unique deps: 2021
```

2021 unique dependencies across 14 projects. Direct installs in `package.json` total around 20–30 per project. The remaining ~1900+ are transitive dependencies found by DFS.

### What to check if it finds 0 projects

1. Confirm `SEARCH_PATH` in `scanner.config.js` matches your actual folder path exactly.
2. Check that your projects have run `npm install` — no install means no `package-lock.json`.
3. Increase `deep` temporarily to `10` to rule out a depth issue.
4. Make sure the target folder is not in `IGNORE_LIST`.

### What to check if the dependency count seems too low

1. Run `npm run extract:test` — if all 34 pass, the extractor is correct and the count is accurate.
2. Check that your projects have run `npm install` recently — stale or missing lockfiles produce low counts.
3. The count will be lower for frontend-only projects vs full MERN stacks.

---

## What `runScan()` will look like when all phases are done

```js
export async function runScan() {
  const lockfiles = await scanProjects(); // Phase 1 — crawler
  const inventory = buildInventory(lockfiles); // Phase 2 — extractor
  const report = await queryOSV(inventory); // Phase 3 — scanner
  await sendReport(report); // Phase 4 — reporter
}
```

`core/index.js` is the only file that will ever import from all four phases. No other file orchestrates the pipeline.

---

## Engineering decisions

| Decision                          | Alternative                    | Why this approach                                                                 |
| --------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| Scan `package-lock.json`          | Scan `package.json`            | Accuracy — lockfile has exact installed versions                                  |
| Central `scanner.config.js`       | Inline constants in crawler    | Separation of config from logic                                                   |
| `fast-glob` over custom algorithm | Hand-rolled recursive scan     | Performance + ignore patterns + depth control, solved problem                     |
| Crawler returns paths only        | Crawler reads file contents    | Single responsibility — finding vs. parsing are different jobs                    |
| DFS for v1 lockfiles              | Flat top-level loop            | Completeness — transitive deps at any depth are found and reported                |
| Inverted index (Hash Map)         | Scan each project individually | Speed — each unique package queried once regardless of how many projects share it |
| `Set` for project accumulation    | Array with manual dedup check  | Correctness — duplicate project names are impossible by definition                |
| Dev flag stored at extraction     | Filter at query time           | Separation — extractor labels data, scanner decides what to do with labels        |

---

## Import rules (enforced by convention)

```
config/    →  imported by core/ only
core/      →  imported by server/ and CLI
server/    →  never imported by client/
client/    →  talks to server via HTTP only, never direct imports
```

Breaking these rules couples layers that change for different reasons and will cause maintenance pain as the project grows.

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

Those are Phases 2–5. This is Phase 1.

---

## Project structure (current)

```
dep-scanner/
├── config/
│   └── scanner.config.js   # WHAT to scan and HOW to crawl
├── core/
│   ├── crawler/
│   │   └── index.js        # Phase 1: finds every package-lock.json
│   └── index.js            # Engine entry point — orchestrates all phases
├── package.json
└── README.md
```

As each phase is completed, `core/` will grow:

```
core/
├── crawler/      ← Phase 1  (done)
├── extractor/    ← Phase 2  (next)
├── scanner/      ← Phase 3
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

Both call `runScan()` from `core/index.js`. The crawler does not know which caller triggered it.

```js
// core/index.js
import { scanProjects } from "./crawler/index.js";

export async function runScan() {
  await scanProjects(); // Phase 1
  // Phase 2, 3, 4 will be chained here as they are built
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
// config/scanner.config.js

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
// core/crawler/index.js
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
  entries.forEach((file) => {
    console.log(`- ${path.dirname(file)}`);
  });

  return entries; // array of absolute lockfile paths — passed to Phase 2
}
```

The crawler returns an array of absolute paths. Phase 2 (the extractor) will receive that array and read each file. The crawler itself never reads the lockfile contents — its only job is to find them.

---

## Running & testing the engine

### Run the full engine

```bash
npm run core
# → nodemon core/index.js
```

`nodemon` restarts on every file save. Use this while actively building.

### What a successful Phase 1 output looks like

```
🚀 Scanning for MERN projects...

✅ Found 4 projects:
- E:/Projects/job-tracker/backend
- E:/Projects/job-tracker/frontend
- E:/Projects/miqat
- E:/Projects/portfolio
```

### What to check if it finds 0 projects

1. Confirm `SEARCH_PATH` in `scanner.config.js` matches your actual folder path exactly.
2. Check that your projects have run `npm install` — no install means no `package-lock.json`.
3. Increase `deep` temporarily to `10` to rule out a depth issue.
4. Make sure the target folder is not in `IGNORE_LIST`.

### What to check if it finds too many

1. A path in `IGNORE_LIST` is probably missing. Add the offending folder name.
2. Reduce `deep` — if your structure is flat, `deep: 2` may be enough.

---

## What `runScan()` will look like when all phases are done

This is the full pipeline. Each line below represents one completed phase:

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

| Decision                    | Alternative                 | Why this approach                                              |
| --------------------------- | --------------------------- | -------------------------------------------------------------- |
| Scan `package-lock.json`    | Scan `package.json`         | Accuracy — lockfile has exact installed versions               |
| Central `scanner.config.js` | Inline constants in crawler | Separation of config from logic                                |
| `fast-glob` over custom DFS | Hand-rolled recursive scan  | Performance + ignore patterns + depth control, solved problem  |
| Crawler returns paths only  | Crawler reads file contents | Single responsibility — finding vs. parsing are different jobs |

---

## Import rules (enforced by convention)

```
config/    →  imported by core/ only
core/      →  imported by server/ and CLI
server/    →  never imported by client/
client/    →  talks to server via HTTP only, never direct imports
```

Breaking these rules couples layers that change for different reasons and will cause maintenance pain as the project grows.

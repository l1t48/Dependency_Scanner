import { buildInventory } from "./index.js";
import { writeFileSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = path.join(__dirname, "mock-lock.json");

// ─── Mock lockfile ─────────────────────────────────────────────────────────────
//
// Dependency tree we are asserting against:
//
//  PROD
//  ├── express@4.19.2
//  │   ├── body-parser@1.20.2
//  │   │   └── bytes@3.1.2
//  │   │       └── ms@2.1.3          ← 4 levels deep
//  │   └── debug@4.3.4
//  │       └── ms@2.1.3              ← same ms, different branch (dedup test)
//  ├── mongoose@8.0.0
//  │   └── bson@6.2.0
//  │       └── buffer@6.0.3
//  ├── axios@1.6.0
//  │   └── form-data@4.0.0
//  │       └── mime-types@2.1.35
//  │           └── mime-db@1.52.0    ← 4 levels deep
//  └── dotenv@16.4.5                 ← leaf node, no transitive deps
//
//  DEV
//  ├── jest@29.7.0
//  │   └── jest-cli@29.7.0
//  │       └── jest-config@29.7.0
//  ├── eslint@8.57.0
//  │   └── chalk@4.1.2
//  └── @babel/core@7.24.0            ← scoped package
//      └── @babel/parser@7.24.0      ← scoped transitive dep
//
// Total unique packages: 20
//   ms@2.1.3 appears in TWO branches — must be deduped to ONE entry.
//
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_LOCKFILE_V1 = {
  lockfileVersion: 1,
  dependencies: {
    // ── PROD ──────────────────────────────────────────────────────────────────

    express: {
      version: "4.19.2",
      dev: false,
      dependencies: {
        "body-parser": {
          version: "1.20.2",
          dev: false,
          dependencies: {
            bytes: {
              version: "3.1.2",
              dev: false,
              dependencies: {
                ms: {
                  version: "2.1.3",
                  dev: false,
                  // ← 4 levels deep: express → body-parser → bytes → ms
                },
              },
            },
          },
        },
        debug: {
          version: "4.3.4",
          dev: false,
          dependencies: {
            ms: {
              version: "2.1.3",
              dev: false,
              // ← same ms@2.1.3 via a different branch
              // DFS will visit it twice — extractor must deduplicate it
            },
          },
        },
      },
    },

    mongoose: {
      version: "8.0.0",
      dev: false,
      dependencies: {
        bson: {
          version: "6.2.0",
          dev: false,
          dependencies: {
            buffer: {
              version: "6.0.3",
              dev: false,
            },
          },
        },
      },
    },

    axios: {
      version: "1.6.0",
      dev: false,
      dependencies: {
        "form-data": {
          version: "4.0.0",
          dev: false,
          dependencies: {
            "mime-types": {
              version: "2.1.35",
              dev: false,
              dependencies: {
                "mime-db": {
                  version: "1.52.0",
                  dev: false,
                  // ← 4 levels deep: axios → form-data → mime-types → mime-db
                },
              },
            },
          },
        },
      },
    },

    dotenv: {
      version: "16.4.5",
      dev: false,
      // ← leaf node — no nested dependencies
      // ensures the DFS handles packages with no children without crashing
    },

    // ── DEV ───────────────────────────────────────────────────────────────────

    jest: {
      version: "29.7.0",
      dev: true,
      dependencies: {
        "jest-cli": {
          version: "29.7.0",
          dev: true,
          dependencies: {
            "jest-config": {
              version: "29.7.0",
              dev: true,
            },
          },
        },
      },
    },

    eslint: {
      version: "8.57.0",
      dev: true,
      dependencies: {
        chalk: {
          version: "4.1.2",
          dev: true,
        },
      },
    },

    "@babel/core": {
      version: "7.24.0",
      dev: true,
      // ← scoped package — name contains "/" which the parser must handle
      dependencies: {
        "@babel/parser": {
          version: "7.24.0",
          dev: true,
          // ← scoped transitive dep
        },
      },
    },
  },
};

// ─── Write mock lockfile, run extractor, clean up ─────────────────────────────

writeFileSync(MOCK_PATH, JSON.stringify(MOCK_LOCKFILE_V1));

const result = buildInventory([
  { project: "test-project", lockfilePath: MOCK_PATH },
]);

unlinkSync(MOCK_PATH);

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

const { uniqueDeps, invertedIndex } = result;
const find = (name) => uniqueDeps.find((d) => d.name === name);

// ─── 1. Total count ───────────────────────────────────────────────────────────
console.log(
  "\n── 1. Total count ───────────────────────────────────────────────\n",
);

// ms@2.1.3 appears in TWO branches but must only produce ONE entry
assert(
  "20 unique packages total (ms deduplicated across branches)",
  uniqueDeps.length,
  20,
);

// ─── 2. Direct prod dependencies ─────────────────────────────────────────────
console.log(
  "\n── 2. Direct prod dependencies ──────────────────────────────────\n",
);

assert("express — version", find("express")?.version, "4.19.2");
assert("express — prod", find("express")?.dev, false);
assert("mongoose — version", find("mongoose")?.version, "8.0.0");
assert("mongoose — prod", find("mongoose")?.dev, false);
assert("axios — version", find("axios")?.version, "1.6.0");
assert("axios — prod", find("axios")?.dev, false);
assert("dotenv — version", find("dotenv")?.version, "16.4.5");
assert("dotenv — leaf node, no crash", find("dotenv") !== undefined, true);

// ─── 3. DFS depth tests ───────────────────────────────────────────────────────
console.log(
  "\n── 3. DFS depth tests ───────────────────────────────────────────\n",
);

// Level 2
assert(
  "body-parser — 1 level deep via express",
  find("body-parser")?.version,
  "1.20.2",
);
assert("debug — 1 level deep via express", find("debug")?.version, "4.3.4");
assert("bson — 1 level deep via mongoose", find("bson")?.version, "6.2.0");
assert(
  "form-data — 1 level deep via axios",
  find("form-data")?.version,
  "4.0.0",
);

// Level 3
assert(
  "bytes — 2 levels deep via express→body-parser",
  find("bytes")?.version,
  "3.1.2",
);
assert(
  "buffer — 2 levels deep via mongoose→bson",
  find("buffer")?.version,
  "6.0.3",
);
assert(
  "mime-types — 2 levels deep via axios→form-data",
  find("mime-types")?.version,
  "2.1.35",
);

// Level 4 — the real DFS proof
assert(
  "ms — 4 levels deep via express→body-parser→bytes (DFS proof)",
  find("ms")?.version,
  "2.1.3",
);
assert(
  "mime-db — 4 levels deep via axios→form-data→mime-types (DFS proof)",
  find("mime-db")?.version,
  "1.52.0",
);

// ─── 4. Deduplication — the critical test ─────────────────────────────────────
console.log(
  "\n── 4. Deduplication ─────────────────────────────────────────────\n",
);

// ms@2.1.3 exists in two branches:
//   express → body-parser → bytes → ms
//   express → debug → ms
// DFS visits it twice — it must appear only ONCE in uniqueDeps

const msEntries = uniqueDeps.filter((d) => d.name === "ms");
assert("ms@2.1.3 appears only once despite two branches", msEntries.length, 1);
assert("ms — correct version after dedup", find("ms")?.version, "2.1.3");

// ─── 5. Dev flag ──────────────────────────────────────────────────────────────
console.log(
  "\n── 5. Dev flag ──────────────────────────────────────────────────\n",
);

assert("jest — dev: true", find("jest")?.dev, true);
assert("jest-cli — dev: true", find("jest-cli")?.dev, true);
assert("jest-config — dev: true", find("jest-config")?.dev, true);
assert("eslint — dev: true", find("eslint")?.dev, true);
assert("chalk — dev: true", find("chalk")?.dev, true);
assert("express — dev: false", find("express")?.dev, false);
assert("dotenv — dev: false", find("dotenv")?.dev, false);

// ─── 6. Scoped packages ───────────────────────────────────────────────────────
console.log(
  "\n── 6. Scoped packages ───────────────────────────────────────────\n",
);

assert(
  "@babel/core — scoped package found",
  find("@babel/core")?.version,
  "7.24.0",
);
assert("@babel/core — dev", find("@babel/core")?.dev, true);
assert(
  "@babel/parser — scoped transitive dep found",
  find("@babel/parser")?.version,
  "7.24.0",
);

// ─── 7. Inverted index ────────────────────────────────────────────────────────
console.log(
  "\n── 7. Inverted index ────────────────────────────────────────────\n",
);

assert("express mapped to test-project", invertedIndex["express@4.19.2"], [
  "test-project",
]);
assert("ms mapped to test-project", invertedIndex["ms@2.1.3"], [
  "test-project",
]);
assert("mime-db mapped to test-project", invertedIndex["mime-db@1.52.0"], [
  "test-project",
]);
assert(
  "@babel/core mapped to test-project",
  invertedIndex["@babel/core@7.24.0"],
  ["test-project"],
);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(
  `\n── ${passed} passed · ${failed} failed ────────────────────────────────────────\n`,
);
if (failed > 0) process.exit(1);

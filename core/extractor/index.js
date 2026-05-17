/**
 * @module extractor
 * @desc Cross-project dependency aggregator and lockfile parser.
 *
 * @logic
 * Processes multiple `package-lock.json` files to create a deduplicated "Inverted Index".
 * 1. **Normalization**: Identifies npm schema versions (v1 vs v2/v3).
 * 2. **Deduplication**: Maps `package@version` keys to a `Set` of projects using them.
 * 3. **DFS/Flat Parsing**: Handles legacy nested dependency trees (v1) via recursion 
 * and modern flat structures (v3) via key iteration.
 *
 * @note 
 * This is the primary optimization layer. By flattening all project dependencies into 
 * a single `uniqueDeps` list, we ensure each unique package/version pair is 
 * audited exactly once, regardless of how many projects contain it.
 */

import { readFileSync } from "fs";

/**
 * @function buildInventory
 * @desc The entry point for inventory generation.
 * @logic 
 * Iterates through lockfiles, builds an internal Map for O(1) lookups during 
 * aggregation, and then serializes that Map into two clean objects for Phase 3 (Auditing).
 */
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

  // Serialise the Map into plain objects for Phase 3
  const uniqueDeps = [];
  const invertedIndex = {};

  for (const [key, value] of invertedMap.entries()) {
    const atIdx = key.lastIndexOf("@");
    const name = key.slice(0, atIdx);
    const version = key.slice(atIdx + 1);

    uniqueDeps.push({ name, version, dev: value.dev });
    invertedIndex[key] = [...value.projects];
  }
  return { uniqueDeps, invertedIndex };
}

/**
 * @function parseLockfile
 * @desc Schema dispatcher for npm lockfile formats.
 * @logic 
 * Checks for the existence of "packages" (v2/v3) or "dependencies" (v1) 
 * to determine the parsing strategy.
 */
function parseLockfile(lockfile) {
  // npm v2/v3 — flat "packages" map (npm 7+)
  if (lockfile.packages) {
    return parseV3(lockfile.packages);
  }

  // npm v1 — nested "dependencies" tree (npm 5-6)
  if (lockfile.dependencies) {
    return parseV1(lockfile.dependencies);
  }
  return [];
}

/**
 * @function parseV3
 * @desc Parser for npm v7+ (Lockfile v2/v3).
 * @logic 
 * Iterates the flat `packages` object. It uses path segment splitting 
 * to extract the package name from the keys (e.g., "node_modules/express").
 */
function parseV3(packages) {
  const deps = [];

  for (const [pkgPath, meta] of Object.entries(packages)) {
    if (!pkgPath || !meta.version) continue; // skip the root entry

    const segments = pkgPath.split("node_modules/");
    const name = segments[segments.length - 1];

    deps.push({ name, version: meta.version, dev: meta.dev ?? false });
  }
  return deps;
}

/**
 * @function parseV1
 * @desc Recursive parser for npm v5/v6 (Lockfile v1).
 * @logic 
 * Implements a Depth-First Search (DFS) to traverse nested `dependencies` 
 * objects, ensuring transitive dependencies are captured even in legacy trees.
 */
function parseV1(dependencies, found = []) {
  for (const [name, meta] of Object.entries(dependencies)) {
    if (!meta.version) continue;

    found.push({ name, version: meta.version, dev: meta.dev ?? false });

    // Recurse into nested dependencies (transitive)
    if (meta.dependencies) {
      parseV1(meta.dependencies, found);
    }
  }
  return found;
}

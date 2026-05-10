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

// ─── Parser ───────────────────────────────────────────────────────────────────

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

// v2/v3: already flat, just iterate the keys
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

// v1: nested tree — needs real DFS to reach transitive dependencies
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

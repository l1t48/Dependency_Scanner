import { CHUNK_SIZE } from "../../config/scanner.config.js";
import { readCacheBatch, writeCacheBatch } from "../cache/index.js";
import { chunkArray } from "./chunk.js";
import { fetchOSVBatch } from "./osv.js";

export async function detectVulnerabilities(toScan) {
  const cacheKeys = toScan.map((d) => `osv_${d.name}@${d.version}`);
  const { hits, misses: missKeys } = readCacheBatch(cacheKeys);

  // 1. Create the lookup map once (O(N))
  const scanMap = new Map(toScan.map((d) => [`${d.name}@${d.version}`, d]));
  const pending = [];

  // ── Resolve from cache (O(1) lookups) ─────────────────────────────────────────
  for (const [key, advisories] of Object.entries(hits)) {
    const dep = scanMap.get(key.slice(4));
    if (dep) {
      for (const adv of advisories) pending.push({ dep, advisoryId: adv.id });
    }
  }

  const hitCount = Object.keys(hits).length;
  if (hitCount > 0) {
    console.log(`[cache] ${hitCount} detection result(s) loaded — no API call`);
  }

  // ── Query OSV for misses (O(1) lookups) ───────────────────────────────────────
  if (missKeys.length > 0) {
    // FIX: Use scanMap.get() instead of .find()
    const missedDeps = missKeys
      .map((key) => scanMap.get(key.slice(4)))
      .filter(Boolean);

    const chunks = chunkArray(missedDeps, CHUNK_SIZE);
    const newEntries = {};

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `[api]   Batch ${i + 1}/${chunks.length} → POST /v1/querybatch (${chunk.length} packages)`,
      );

      const results = await fetchOSVBatch(chunk);
      if (!results) continue;

      for (let j = 0; j < chunk.length; j++) {
        const dep = chunk[j];
        const advisories = results[j]?.vulns ?? [];
        newEntries[`osv_${dep.name}@${dep.version}`] = advisories;
        for (const adv of advisories) pending.push({ dep, advisoryId: adv.id });
      }
    }

    writeCacheBatch(newEntries);
    console.log(
      `[cache] ${Object.keys(newEntries).length} detection result(s) stored`,
    );
  }

  return pending;
}

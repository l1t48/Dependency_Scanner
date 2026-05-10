import { CHUNK_SIZE } from "../../config/scanner.config.js";
import { readCacheBatch, writeCacheBatch } from "../cache/index.js";
import { chunkArray } from "./chunk.js";
import { fetchOSVBatch } from "./osv.js";

export async function detectVulnerabilities(toScan) {
  const cacheKeys = toScan.map((d) => `osv_${d.name}@${d.version}`);
  const { hits, misses: missKeys } = readCacheBatch(cacheKeys);

  const pending = [];

  // ── Resolve from cache — no API call ─────────────────────────────────────────
  for (const [key, advisories] of Object.entries(hits)) {
    if (!advisories.length) continue;
    const dep = toScan.find((d) => `${d.name}@${d.version}` === key.slice(4));
    if (!dep) continue;
    for (const adv of advisories) pending.push({ dep, advisoryId: adv.id });
  }

  const hitCount = Object.keys(hits).length;
  if (hitCount > 0) {
    console.log(`[cache] ${hitCount} detection result(s) loaded — no API call`);
  }

  // ── Query OSV for misses — API call ──────────────────────────────────────────
  if (missKeys.length > 0) {
    const missedDeps = missKeys
      .map((key) =>
        toScan.find((d) => `${d.name}@${d.version}` === key.slice(4)),
      )
      .filter(Boolean);

    const chunks = chunkArray(missedDeps, CHUNK_SIZE);
    const newEntries = {};

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `[api]   Batch ${i + 1}/${chunks.length} → POST /v1/querybatch (${chunk.length} packages)`,
      );

      const results = await fetchOSVBatch(chunk);
      if (!results) {
        console.warn(`[api]   Batch ${i + 1} failed — skipping`);
        continue;
      }

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

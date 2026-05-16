import { CHUNK_SIZE } from "../../config/scanner.config.js";
import { readCacheBatch, writeCacheBatch } from "../cache/index.js";
import { chunkArray } from "../utils/chunk.js";
import { fetchOSVBatch } from "./osv.js";

/**
 * @module detect
 * @desc Pass 1 — batch vulnerability detection against OSV.
 *
 * @logic
 *   1. Resolve cache hits synchronously — no API call for known deps.
 *   2. Split remaining (cache misses) into chunks of CHUNK_SIZE.
 *   3. Dispatch all chunks concurrently via Promise.all.
 *   4. Write new results to cache in one atomic flush.
 *   5. Return the full `pending` list for Pass 2 (enrich).
 *
 * @note
 *   Chunks run concurrently within Pass 1, but Pass 2 (enrichment) begins
 *   only after detectVulnerabilities resolves. This keeps the two passes
 *   explicit and easy to reason about. At the scale this tool targets
 *   (personal / small-team project folders) the separation costs nothing
 *   meaningful in wall-clock time, especially on warm cache runs.
 */
export async function detectVulnerabilities(toScan) {
  const cacheKeys = toScan.map((d) => `osv_${d.name}@${d.version}`);
  const { hits, misses: missKeys } = readCacheBatch(cacheKeys);

  const scanMap = new Map(toScan.map((d) => [`${d.name}@${d.version}`, d]));
  const pending = [];
  const scanErrors = [];
  const allNewEntries = {};

  // ── Resolve from cache ────────────────────────────────────────────────────
  for (const [key, advisories] of Object.entries(hits)) {
    const dep = scanMap.get(key.slice(4)); // strip "osv_" prefix
    if (dep) {
      for (const adv of advisories) pending.push({ dep, advisoryId: adv.id });
    }
  }

  const hitCount = Object.keys(hits).length;
  if (hitCount > 0) {
    console.log(`[cache] ${hitCount} detection result(s) loaded — no API call`);
  }

  // ── Dispatch all chunks concurrently ──────────────────────────────────────
  if (missKeys.length > 0) {
    const missedDeps = missKeys
      .map((k) => scanMap.get(k.slice(4)))
      .filter(Boolean);
    const chunks = chunkArray(missedDeps, CHUNK_SIZE);

    console.log(`[api]   Dispatching ${chunks.length} batch(es) concurrently`);

    await Promise.all(
      chunks.map(async (chunk, i) => {
        console.log(
          `[api]   Batch ${i + 1}/${chunks.length} → POST /v1/querybatch (${chunk.length} packages)`,
        );

        let results;
        try {
          results = await fetchOSVBatch(chunk);
        } catch {
          console.error(
            `[scanner] ⚠️  Batch ${i + 1} failed after retries — ` +
              `${chunk.length} package(s) could not be verified`,
          );
          for (const dep of chunk) scanErrors.push(dep);
          return;
        }

        if (!results) return;

        for (let j = 0; j < chunk.length; j++) {
          const dep = chunk[j];
          const advisories = results[j]?.vulns ?? [];
          const cacheKey = `osv_${dep.name}@${dep.version}`;

          allNewEntries[cacheKey] = advisories;

          for (const adv of advisories) {
            pending.push({ dep, advisoryId: adv.id });
          }
        }
      }),
    );

    await writeCacheBatch(allNewEntries);
    console.log(
      `[cache] ${Object.keys(allNewEntries).length} detection result(s) stored`,
    );
  }

  return { pending, scanErrors };
}

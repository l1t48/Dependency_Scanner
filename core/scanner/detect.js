import { CHUNK_SIZE } from "../../config/scanner.config.js";
import { readCacheBatch, writeCacheBatch } from "../cache/index.js";
import { chunkArray } from "./chunk.js";
import { fetchOSVBatch } from "./osv.js";

/**
 * @module detect
 * @desc Pass 1 — batch vulnerability detection against OSV.
 *
 * @logic
 *   Chunks are dispatched concurrently rather than sequentially.
 *   Each resolved chunk immediately calls onChunkReady(pending, newEntries)
 *   so Pass 2 enrichment can begin on early results while later chunks
 *   are still in-flight — eliminating the hard wall between the two passes.
 *
 * @note
 *   onChunkReady is optional. When omitted, behaviour is identical to the
 *   original sequential version (useful for testing in isolation).
 */
export async function detectVulnerabilities(toScan, { onChunkReady } = {}) {
  const cacheKeys = toScan.map((d) => `osv_${d.name}@${d.version}`);
  const { hits, misses: missKeys } = readCacheBatch(cacheKeys);

  const scanMap = new Map(toScan.map((d) => [`${d.name}@${d.version}`, d]));
  const pending = [];
  const scanErrors = [];
  const allNewEntries = {};

  // ── Resolve from cache ────────────────────────────────────────────────────
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
        } catch (err) {
          console.error(
            `[scanner] ⚠️  Batch ${i + 1} failed after retries — ` +
              `${chunk.length} package(s) could not be verified`,
          );
          for (const dep of chunk) scanErrors.push(dep);
          return;
        }

        if (!results) return;

        // Build this chunk's pending list and cache entries
        const chunkPending = [];
        const chunkEntries = {};

        for (let j = 0; j < chunk.length; j++) {
          const dep = chunk[j];
          const advisories = results[j]?.vulns ?? [];
          const cacheKey = `osv_${dep.name}@${dep.version}`;

          chunkEntries[cacheKey] = advisories;
          allNewEntries[cacheKey] = advisories;

          for (const adv of advisories) {
            const item = { dep, advisoryId: adv.id };
            chunkPending.push(item);
            pending.push(item);
          }
        }

        // ← Pass 2 can start on this chunk immediately
        if (onChunkReady && chunkPending.length > 0) {
          onChunkReady(chunkPending, chunkEntries);
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

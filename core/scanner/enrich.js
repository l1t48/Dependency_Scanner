/**
 * @module advisory-enricher
 * @desc Data enrichment engine for security advisories.
 *
 * @logic
 * Implements a "Cache-Aside" pattern with throttled network execution:
 * 1. **Deduplication**: Filters incoming batches to unique advisory IDs to minimize work.
 * 2. **Cache Resolution**: Queries the local cache to resolve known advisories instantly.
 * 3. **Throttled Fetching**: Missing advisories are fetched from OSV via a Semaphore 
 * to stay within API rate limits (CONCURRENCY_LIMIT).
 * 4. **Resilience**: Failed network requests are converted into "unknown stubs" to 
 * prevent the entire pipeline from crashing.
 *
 * @note
 * Successful fetches are persisted to the cache immediately. Failed fetches are 
 * NOT cached, allowing for a retry in subsequent scans without manual cache clearing.
 */

import { CONCURRENCY_LIMIT } from "../../config/scanner.config.js";
import { readCacheBatch, writeCacheBatch } from "../cache/index.js";
import { fetchFullAdvisory } from "./osv.js";
import { createSemaphore } from "../utils/semaphore.js";

/**
 * @private
 * Global semaphore instance to manage network pressure across all batch calls.
 */
const run = createSemaphore(CONCURRENCY_LIMIT);

/**
 * @private
 * @desc Fallback generator for unreachable advisories.
 */
function unknownStub(id) {
  return {
    id,
    summary: "Advisory details unavailable — API unreachable after retries",
    severity: [],
    database_specific: { severity: "UNKNOWN" },
    _fetchFailed: true,
  };
}

/**
 * @function enrichBatch
 * @desc Enriches a subset of vulnerabilities with full advisory metadata.
 * @logic 
 * Splits the work into Hits (cached) and Misses (network). It slices the "adv_" 
 * prefix used in cache keys to interact with the raw OSV IDs. Uses `Promise.all` 
 * on the throttled network calls for efficient parallel execution.
 * @param {Array} pendingItems - List of objects containing advisoryId.
 * @returns {Promise<Map<string, object>>} Map of Advisory IDs to full metadata objects.
 */
export async function enrichBatch(pendingItems) {
  const ids = [...new Set(pendingItems.map((p) => p.advisoryId))];
  const advKeys = ids.map((id) => `adv_${id}`);
  const { hits, misses } = readCacheBatch(advKeys);

  const result = new Map();

  for (const [key, full] of Object.entries(hits)) {
    result.set(key.slice(4), full);
  }

  if (misses.length > 0) {
    const missingIds = misses.map((k) => k.slice(4));
    const fetched = await Promise.all(
      missingIds.map((id) => run(() => fetchFullAdvisory(id))),
    );

    const newEntries = {};
    for (let i = 0; i < missingIds.length; i++) {
      const id = missingIds[i];
      const full = fetched[i] ?? unknownStub(id);
      result.set(id, full);
      if (!full._fetchFailed) newEntries[`adv_${id}`] = full;
    }

    if (Object.keys(newEntries).length > 0) {
      await writeCacheBatch(newEntries);
    }
  }

  return result;
}

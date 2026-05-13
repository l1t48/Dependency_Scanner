import { CONCURRENCY_LIMIT } from "../../config/scanner.config.js";
import { readCacheBatch, writeCacheBatch } from "../cache/index.js";
import { fetchFullAdvisory } from "./osv.js";
import { createSemaphore } from "../utils/semaphore.js";

const run = createSemaphore(CONCURRENCY_LIMIT);

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
 * enrichBatch(pendingItems)
 * Enrich a subset of pending items — called per-chunk during pipelining.
 * Returns a Map<advisoryId, fullAdvisory> for only the IDs in this batch.
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

/**
 * enrichAdvisories(pending)
 * Original interface — enriches the full pending list at once.
 * Used when pipelining is not active (e.g. all results came from cache).
 */
export async function enrichAdvisories(pending) {
  return enrichBatch(pending);
}

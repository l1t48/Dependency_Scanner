import { readCacheBatch, writeCacheBatch } from "../cache/index.js";
import { fetchFullAdvisory } from "./osv.js";

export async function enrichAdvisories(pending) {
  const uniqueIds = [...new Set(pending.map((p) => p.advisoryId))];
  const advKeys = uniqueIds.map((id) => `adv_${id}`);
  const { hits, misses } = readCacheBatch(advKeys);

  const fullAdvisories = new Map();

  // ── Restore from cache — no API call ─────────────────────────────────────────
  for (const [key, full] of Object.entries(hits)) {
    fullAdvisories.set(key.slice(4), full); // strip "adv_" prefix
  }

  const hitCount = Object.keys(hits).length;
  if (hitCount > 0) {
    console.log(`[cache] ${hitCount} advisory detail(s) loaded — no API call`);
  }

  // ── Fetch missing advisories — API call ───────────────────────────────────────
  if (misses.length > 0) {
    const missingIds = misses.map((k) => k.slice(4));
    console.log(
      `[api]   Fetching ${missingIds.length} advisory detail(s) → GET /v1/vulns/{id}`,
    );

    // Parallel fetch — OSV public API handles concurrent requests fine
    const fetched = await Promise.all(missingIds.map(fetchFullAdvisory));
    const newEntries = {};

    for (let i = 0; i < missingIds.length; i++) {
      const full = fetched[i];
      if (full) {
        fullAdvisories.set(missingIds[i], full);
        newEntries[`adv_${missingIds[i]}`] = full;
      }
    }

    if (Object.keys(newEntries).length > 0) {
      writeCacheBatch(newEntries);
      console.log(
        `[cache] ${Object.keys(newEntries).length} advisory detail(s) stored`,
      );
    }
  }

  return fullAdvisories;
}

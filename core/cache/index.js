/**
 * @module cache
 * @desc In-process advisory cache backed by cache.json.
 *
 * @logic
 *   Reads synchronously on first access (one-time startup cost, acceptable).
 *   All writes go through an atomic flush:
 *     1. Serialize to cache.json.tmp
 *     2. fs.rename() — atomic at the OS level (succeeds 100% or fails 0%)
 *   This ensures JSON.parse never sees a half-written file after a crash or Ctrl+C.
 *
 * @note
 *   clearCache() also prunes entries older than PRUNE_AFTER_MS before saving,
 *   keeping the file lean even after months of scanning.
 */

import { readFileSync, existsSync } from "fs";
import { writeFile, rename, unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { TTL_MS, PRUNE_AFTER_MS } from "../../config/scanner.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "cache.json");
const CACHE_TMP = `${CACHE_FILE}.tmp`;

/**
 * @private
 * @desc Queue for write operations.
 * @logic 
 * Prevents race conditions where multiple async flushes might attempt 
 * to write to the .tmp file simultaneously.
 */
let _flushChain = Promise.resolve();
let _cache = null;

/**
 * @private
 * @desc Lazy-loader for the cache object.
 * @logic 
 * Uses sync I/O on the first call to block execution until the state 
 * is ready, then caches the object in memory for the rest of the process.
 */
function load() {
  if (_cache !== null) return _cache;
  if (!existsSync(CACHE_FILE)) return (_cache = {});
  try {
    _cache = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    console.warn("[cache] Could not parse cache.json — starting fresh");
    _cache = {};
  }
  return _cache;
}

/**
 * @private
 * @desc Atomic filesystem sync.
 * @logic 
 * Queues the write operation at the end of the current _flushChain. 
 * Writes to a temporary file before renaming it over the original, 
 * ensuring the primary cache file is never corrupted by partial writes.
 */
async function flush() {
  _flushChain = _flushChain.then(async () => {
    try {
      await writeFile(CACHE_TMP, JSON.stringify(_cache, null, 2), "utf-8");
      await rename(CACHE_TMP, CACHE_FILE);
    } catch (err) {
      console.error("[cache] Flush failed —", err.message);
      try { await unlink(CACHE_TMP); } catch { }
    }
  });
  return _flushChain;
}

/**
 * @function readCacheBatch
 * @desc Retrieves valid entries and identifies misses for a set of keys.
 * @logic 
 * Iterates through keys and compares 'cachedAt' timestamps against TTL_MS. 
 * If an entry is expired or missing, it is flagged as a miss for fresh fetching.
 */
export function readCacheBatch(keys) {
  const cache = load();
  const now = Date.now();
  const hits = {};
  const misses = [];

  for (const key of keys) {
    const entry = cache[key];
    if (!entry || now - entry.cachedAt > TTL_MS) {
      misses.push(key);
    } else {
      hits[key] = entry.value;
    }
  }

  return { hits, misses };
}

/**
 * @function writeCacheBatch
 * @desc Updates the memory store and flushes to disk.
 * @logic 
 * Updates the global _cache object with new timestamps and values before 
 * triggering a background flush.
 */
export async function writeCacheBatch(entries) {
  const cache = load();
  const now = Date.now();

  for (const [key, value] of Object.entries(entries)) {
    cache[key] = { value, cachedAt: now };
  }

  await flush();
}

/**
 * @function getCacheStats
 * @desc Provides health metrics for the cache.
 * @logic 
 * Performs a shallow scan of the cache object to calculate valid vs expired 
 * ratios based on current TTL.
 */
export function getCacheStats() {
  const cache = load();
  const entries = Object.entries(cache);
  const now = Date.now();
  const valid = entries.filter(([, e]) => now - e.cachedAt < TTL_MS).length;
  return { total: entries.length, valid, expired: entries.length - valid };
}

/**
 * @function clearCache
 * @desc Maintenance routine for pruning or wiping data.
 * @logic 
 * Selective pruning uses PRUNE_AFTER_MS to remove "stale" entries that are 
 * no longer likely to be useful, preventing the JSON file from growing 
 * indefinitely. Force mode ignores logic and resets the object.
 */
export async function clearCache({ force = false } = {}) {
  const cache = load();
  const now = Date.now();

  if (force) {
    _cache = {};
    console.log("[cache] Full wipe ✓");
  } else {
    let pruned = 0;
    for (const key of Object.keys(cache)) {
      if (now - cache[key].cachedAt > PRUNE_AFTER_MS) {
        delete cache[key];
        pruned++;
      }
    }
    console.log(
      `[cache] Pruned ${pruned} stale entries (>${PRUNE_AFTER_MS / 86_400_000}d old) ✓`,
    );
  }

  await flush();
}

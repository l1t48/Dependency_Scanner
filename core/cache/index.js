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
let _flushChain = Promise.resolve();

let _cache = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
 * Atomic flush: write to .tmp first, then rename into place.
 * If the process is killed mid-write the original file is untouched.
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * readCacheBatch(keys)
 * Returns hits (valid, within TTL) and misses (absent or expired).
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
 * writeCacheBatch(entries)
 * Writes all entries in one pass then flushes once atomically.
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
 * getCacheStats()
 * Returns { total, valid, expired } — used by scanner for pre-scan logging.
 */
export function getCacheStats() {
  const cache = load();
  const entries = Object.entries(cache);
  const now = Date.now();
  const valid = entries.filter(([, e]) => now - e.cachedAt < TTL_MS).length;
  return { total: entries.length, valid, expired: entries.length - valid };
}

/**
 * clearCache()
 * Prunes entries older than PRUNE_AFTER_MS, then flushes.
 * Use `force: true` to wipe everything regardless of age.
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

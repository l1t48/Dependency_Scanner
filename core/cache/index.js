import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TTL_MS } from "../../config/scanner.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "cache.json");

let _cache = null;

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

function flush() {
  writeFileSync(CACHE_FILE, JSON.stringify(_cache, null, 2));
}

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
 * Writes all entries in one pass then flushes once — not once per entry.
 */
export function writeCacheBatch(entries) {
  const cache = load();
  const now = Date.now();
  for (const [key, value] of Object.entries(entries)) {
    cache[key] = { value, cachedAt: now };
  }
  flush();
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
 * Wipes cache entirely. Use when you want to force a full re-scan.
 */
export function clearCache() {
  _cache = {};
  flush();
  console.log("[cache] Cleared ✓");
}

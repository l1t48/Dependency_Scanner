/**
 * @module osv
 * @desc OSV.dev API client with exponential-backoff retry.
 *
 * @logic
 *   5xx responses are transient server faults — we retry up to MAX_RETRIES
 *   times with exponential backoff (500ms → 1s → 2s).
 *   4xx responses are client errors and are not retried; null is returned
 *   immediately so the caller can log and continue.
 *
 * @error_handling
 *   After exhausting retries on fetchOSVBatch, throws so detect.js can
 *   record which deps were unverifiable (avoids false-secure reports).
 *   After exhausting retries on fetchFullAdvisory, returns null so
 *   enrich.js can substitute an "Unknown" severity stub.
 */

import {
  OSV_BATCH_URL,
  OSV_VULN_URL,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
} from "../../config/scanner.config.js";
import { withRetry } from "../utils/retry.js";

/**
 * @function fetchOSVBatch
 * @desc Queries the OSV database for a chunk of dependencies.
 * @logic 
 * Transforms a dependency chunk into the specific OSV "queries" JSON format. 
 * It uses the `withRetry` utility to manage network stability.
 * @param {Array} chunk - Array of {name, version} objects.
 * @returns {Promise<Array|null>} Array of results or null on 4xx error.
 */
export async function fetchOSVBatch(chunk) {
  const body = {
    queries: chunk.map((dep) => ({
      version: dep.version,
      package: { name: dep.name, ecosystem: "npm" },
    })),
  };

  // withRetry throws after MAX_RETRIES exhausted — let detect.js catch it
  return withRetry(
    async (attempt) => {
      if (attempt > 0) {
        console.warn(`[api] OSV batch retry ${attempt}/${MAX_RETRIES}`);
      }

      const res = await fetch(OSV_BATCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // 5xx → throw so withRetry backs off and retries
      if (res.status >= 500) {
        throw Object.assign(
          new Error(`OSV batch HTTP ${res.status}: ${res.statusText}`),
          { status: res.status },
        );
      }

      // 4xx → caller mistake, not retryable; return null immediately
      if (!res.ok) {
        console.error(`[api] OSV batch HTTP ${res.status}: ${res.statusText}`);
        return null;
      }

      const data = await res.json();

      if (!Array.isArray(data.results)) {
        console.error("[api] OSV batch — unexpected response shape");
        return null;
      }

      return data.results;
    },
    {
      maxRetries: MAX_RETRIES,
      baseDelayMs: RETRY_BASE_DELAY_MS,
      // Only retry on 5xx; let network errors (no `.status`) retry too
      isRetryable: (err) => !err.status || err.status >= 500,
    },
  );
}

/**
 * @function fetchFullAdvisory
 * @desc Retrieves the complete JSON record for a specific vulnerability ID.
 * @logic 
 * Performs a simple GET request to the vulnerability endpoint. Like the batch 
 * call, it only retries on server-side (5xx) faults.
 * @param {string} id - The OSV/GHSA/CVE identifier.
 * @returns {Promise<object|null>} Full advisory JSON or null on failure.
 */
export async function fetchFullAdvisory(id) {
  try {
    return await withRetry(
      async (attempt) => {
        if (attempt > 0) {
          console.warn(`[api] Advisory ${id} retry ${attempt}/${MAX_RETRIES}`);
        }

        const res = await fetch(`${OSV_VULN_URL}/${id}`);

        if (res.status >= 500) {
          throw Object.assign(new Error(`Advisory ${id} HTTP ${res.status}`), {
            status: res.status,
          });
        }

        if (!res.ok) {
          // 404 etc. — advisory genuinely missing, don't retry
          console.warn(`[api] Advisory ${id} — HTTP ${res.status}, skipping`);
          return null;
        }

        return res.json();
      },
      {
        maxRetries: MAX_RETRIES,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        isRetryable: (err) => !err.status || err.status >= 500,
      },
    );
  } catch (err) {
    // Retries exhausted — caller will substitute "Unknown" stub
    console.error(
      `[api] Advisory ${id} unreachable after ${MAX_RETRIES} retries — ${err.message}`,
    );
    return null;
  }
}

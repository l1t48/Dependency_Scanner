/**
 * @module retry
 * @desc Exponential-backoff retry wrapper for async operations.
 *
 * @logic
 *   Calls `fn(attempt)` up to `maxRetries + 1` times.
 *   Only retries when `isRetryable(err)` returns true — so 4xx errors
 *   (client mistakes) are not retried, only transient 5xx server faults.
 *   Delays: baseDelayMs * 2^attempt → 500ms, 1000ms, 2000ms by default.
 *
 * @note
 *   `fn` receives the current attempt index (0-based) so callers can
 *   log "retrying (attempt 2)" without duplicating the counter.
 */
export async function withRetry(
  fn,
  { maxRetries = 3, baseDelayMs = 500, isRetryable = () => true } = {},
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const retriable = isRetryable(err);
      const exhausted = attempt === maxRetries;

      if (!retriable || exhausted) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `[retry] Attempt ${attempt + 1}/${maxRetries + 1} failed — ` +
          `retrying in ${delay}ms (${err.message})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

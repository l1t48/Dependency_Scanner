/**
 * @module semaphore
 * @desc Zero-dependency concurrency limiter.
 *
 * @logic
 *   Returns a `run(fn)` wrapper. At most `limit` async functions execute
 *   simultaneously; any excess are queued and fire as active slots free.
 *   This prevents EMFILE ("too many open files") when enriching hundreds
 *   of advisories in parallel.
 *
 * @example
 *   const run = createSemaphore(15);
 *   const results = await Promise.all(ids.map(id => run(() => fetch(id))));
 */
export function createSemaphore(limit) {
  let active = 0;
  const queue = [];

  return function run(fn) {
    return new Promise((resolve, reject) => {
      const attempt = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          active--;
          // Drain one queued task now that a slot is free
          if (queue.length > 0) queue.shift()();
        }
      };

      if (active < limit) {
        attempt();
      } else {
        queue.push(attempt);
      }
    });
  };
}

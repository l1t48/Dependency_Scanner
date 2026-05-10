/**
 * Splits a flat array into sub-arrays of at most `size` elements.
 * The OSV batch API accepts a maximum of 1,000 queries per request.
 *
 * Example: chunkArray([1,2,3,4,5], 2) → [[1,2], [3,4], [5]]
 */
export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
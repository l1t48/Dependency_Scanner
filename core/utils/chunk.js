/**
 * @function chunkArray
 * @desc Splits a flat array into sub-arrays of a fixed maximum length.
 * @logic 
 * Calculates indices based on the provided size and slices the array 
 * accordingly. The final chunk may be smaller than `size` if the total 
 * length is not a perfect multiple.
 * @example
 * chunkArray([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 * @param {Array} arr - The source array to be split.
 * @param {number} size - Maximum elements per chunk.
 * @returns {Array[]} An array containing the segmented chunks.
 */
export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
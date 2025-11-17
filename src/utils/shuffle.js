/**
 * Randomly selects an element from an array
 *
 * @param {Array} array - The array to select from
 * @returns {*} A random element from the array
 */
export function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Randomly selects an element from an array, excluding specified elements
 *
 * @param {Array} array - The array to select from
 * @param {Array} exclude - Elements to exclude from selection
 * @returns {*} A random element from the array (not in exclude list)
 */
export function randomElementExcluding(array, exclude = []) {
  const filtered = array.filter(item => !exclude.includes(item));
  if (filtered.length === 0) return randomElement(array);
  return randomElement(filtered);
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 *
 * @param {Array} array - The array to shuffle
 * @returns {Array} A new shuffled array
 */
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

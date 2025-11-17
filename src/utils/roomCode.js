/**
 * Generates a random 4-character room code
 * Uses alphanumeric characters (excluding confusing ones like 0, O, I, l)
 *
 * @returns {string} 4-character room code (e.g., "XK7D")
 */
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

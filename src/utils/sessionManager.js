/**
 * Session Management Utility
 * Handles localStorage persistence for player reconnection
 */

const SESSION_KEY = 'intimacy_ladder_session';

/**
 * Session data structure:
 * {
 *   playerId: string (UUID),
 *   sessionToken: string (UUID),
 *   roomCode: string (4-char code),
 *   playerName: string,
 *   joinedAt: string (ISO timestamp)
 * }
 */

/**
 * Save session data to localStorage
 * @param {Object} sessionData - Session information to persist
 */
export function saveSession(sessionData) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

/**
 * Load session data from localStorage
 * @returns {Object|null} Session data or null if not found
 */
export function loadSession() {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;

    const session = JSON.parse(data);

    // Validate session structure
    if (!session.playerId || !session.sessionToken || !session.roomCode) {
      console.warn('Invalid session data found, clearing...');
      clearSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Failed to load session:', error);
    clearSession();
    return null;
  }
}

/**
 * Clear session data from localStorage
 */
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}

/**
 * Check if a session exists
 * @returns {boolean} True if session exists
 */
export function hasSession() {
  return !!loadSession();
}

/**
 * Game configuration constants
 */

export const GAME_CONFIG = {
  // Number of questions per level before progressing to next level
  QUESTIONS_PER_LEVEL: 3,

  // Minimum and maximum number of players
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 10,

  // Game status constants
  STATUS: {
    LOBBY: 'lobby',
    PLAYING: 'playing',
    FINISHED: 'finished'
  },

  // Question levels (5 = most intimate, 1 = least intimate)
  LEVELS: {
    LEVEL_5: 5,
    LEVEL_4: 4,
    LEVEL_3: 3,
    LEVEL_2: 2,
    LEVEL_1: 1
  },

  // Level colors for UI
  LEVEL_COLORS: {
    5: 'bg-level5',
    4: 'bg-level4',
    3: 'bg-level3',
    2: 'bg-level2',
    1: 'bg-level1'
  },

  // Level names
  LEVEL_NAMES: {
    5: 'Core Identity',
    4: 'Emotions & Vulnerabilities',
    3: 'Beliefs & Values',
    2: 'Experiences & Opinions',
    1: 'Biographical'
  }
};

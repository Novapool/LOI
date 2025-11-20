import { memo } from 'react';
import { GAME_CONFIG } from '../config';

/**
 * QuestionCard component - Displays the current question with animations
 *
 * @param {Object} props
 * @param {string} props.question - The question to display
 * @param {number} props.level - The current level (1-5)
 * @param {boolean} props.isCustomQuestion - Whether this is a custom question
 * @param {boolean} props.isAnswerer - Whether current player is the answerer
 * @param {Object} props.rerollsUsed - Object tracking reroll usage per level (structure: { "level": [playerId1, playerId2] })
 * @param {string} props.playerId - Current player's ID
 * @param {function} props.onReroll - Callback when reroll button is clicked
 */
function QuestionCard({ question, level, isCustomQuestion = false, isAnswerer = false, rerollsUsed = {}, playerId, onReroll }) {
  const levelColor = GAME_CONFIG.LEVEL_COLORS[level];
  const levelName = GAME_CONFIG.LEVEL_NAMES[level];

  // Check if this player has used their reroll for current level
  const levelKey = level.toString();
  const hasUsedReroll = rerollsUsed[levelKey] && Array.isArray(rerollsUsed[levelKey]) && rerollsUsed[levelKey].includes(playerId);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Level Indicator */}
      <div className="text-center mb-6 flex justify-center items-center gap-3">
        <div className={`inline-block ${levelColor} text-white px-6 py-2 border-4 border-gray-900 rounded-lg font-pixel text-lg`}>
          LEVEL {level}: {levelName}
        </div>
        {isCustomQuestion && (
          <div className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 border-4 border-purple-900 rounded-lg font-pixel text-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            CUSTOM
          </div>
        )}
      </div>

      {/* Question Card */}
      <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-8 md:p-12 animate-fadeIn">
        <p className="text-2xl md:text-3xl font-pixel font-bold text-gray-800 text-center leading-relaxed">
          {question}
        </p>
      </div>

      {/* Reroll Button - Only shown to answerer if they haven't used it this level */}
      {isAnswerer && !hasUsedReroll && onReroll && (
        <div className="mt-6 text-center">
          <button
            onClick={onReroll}
            className="bg-purple-600 text-white border-4 border-purple-900 px-6 py-3 rounded-lg font-pixel text-xl hover:bg-purple-700 active:translate-y-1 flex items-center gap-2 mx-auto"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            REROLL QUESTION (1 PER LEVEL)
          </button>
          <p className="text-gray-600 font-pixel text-sm mt-2">
            DON'T LIKE THIS QUESTION? REROLL FOR A NEW ONE!
          </p>
        </div>
      )}

      {/* Reroll Used Indicator */}
      {isAnswerer && hasUsedReroll && (
        <div className="mt-6 text-center">
          <p className="text-gray-500 font-pixel text-lg">
            REROLL ALREADY USED FOR THIS LEVEL
          </p>
        </div>
      )}

      {/* Level Progress Indicator */}
      <div className="mt-6 flex justify-center items-center space-x-2">
        {[5, 4, 3, 2, 1].map((lvl) => (
          <div
            key={lvl}
            className={`h-3 w-12 border-2 border-gray-800 ${
              lvl === level
                ? GAME_CONFIG.LEVEL_COLORS[lvl]
                : lvl > level
                ? 'bg-gray-300'
                : 'bg-gray-500'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(QuestionCard);

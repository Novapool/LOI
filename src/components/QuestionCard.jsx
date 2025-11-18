import { GAME_CONFIG } from '../config';

/**
 * QuestionCard component - Displays the current question with animations
 *
 * @param {Object} props
 * @param {string} props.question - The question to display
 * @param {number} props.level - The current level (1-5)
 * @param {boolean} props.isCustomQuestion - Whether this is a custom question
 */
export default function QuestionCard({ question, level, isCustomQuestion = false }) {
  const levelColor = GAME_CONFIG.LEVEL_COLORS[level];
  const levelName = GAME_CONFIG.LEVEL_NAMES[level];

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Level Indicator */}
      <div className="text-center mb-6 flex justify-center items-center gap-3">
        <div className={`inline-block ${levelColor} text-white px-6 py-2 rounded-full font-semibold text-sm`}>
          Level {level}: {levelName}
        </div>
        {isCustomQuestion && (
          <div className="inline-flex items-center gap-1 bg-purple-500 text-white px-4 py-2 rounded-full font-semibold text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Custom
          </div>
        )}
      </div>

      {/* Question Card */}
      <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 animate-fadeIn">
        <p className="text-2xl md:text-3xl font-bold text-gray-800 text-center leading-relaxed">
          {question}
        </p>
      </div>

      {/* Level Progress Indicator */}
      <div className="mt-6 flex justify-center items-center space-x-2">
        {[5, 4, 3, 2, 1].map((lvl) => (
          <div
            key={lvl}
            className={`h-2 w-12 rounded-full transition-all ${
              lvl === level
                ? GAME_CONFIG.LEVEL_COLORS[lvl]
                : lvl > level
                ? 'bg-gray-300'
                : 'bg-gray-400'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

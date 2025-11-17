import { GAME_CONFIG } from '../config';

/**
 * QuestionCard component - Displays the current question with animations
 *
 * @param {Object} props
 * @param {string} props.question - The question to display
 * @param {number} props.level - The current level (1-5)
 */
export default function QuestionCard({ question, level }) {
  const levelColor = GAME_CONFIG.LEVEL_COLORS[level];
  const levelName = GAME_CONFIG.LEVEL_NAMES[level];

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Level Indicator */}
      <div className="text-center mb-6">
        <div className={`inline-block ${levelColor} text-white px-6 py-2 rounded-full font-semibold text-sm`}>
          Level {level}: {levelName}
        </div>
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

import { useState, useEffect, useCallback, memo } from 'react';
import { getRandomQuestions } from '../data/questions';
import { GAME_CONFIG } from '../config';

/**
 * QuestionSelector component - Allows asker to select or write a question
 *
 * @param {Object} props
 * @param {number} props.level - Current game level (1-5)
 * @param {Array<string>} props.askedQuestions - Questions already asked
 * @param {string} props.targetPlayerName - Name of the player who will answer
 * @param {function} props.onQuestionSelected - Callback when question is selected
 */
function QuestionSelector({ level, askedQuestions, targetPlayerName, onQuestionSelected }) {
  const [questionOptions, setQuestionOptions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const [selectionMode, setSelectionMode] = useState(null); // 'bank' | 'custom'

  const levelColor = GAME_CONFIG.LEVEL_COLORS[level];
  const levelName = GAME_CONFIG.LEVEL_NAMES[level];

  // Generate new random question options - memoized to prevent unnecessary recreations
  const refreshQuestions = useCallback(() => {
    const newOptions = getRandomQuestions(level, 5, askedQuestions || []);
    setQuestionOptions(newOptions);
    // Reset selection if refreshing
    if (selectionMode === 'bank') {
      setSelectedQuestion(null);
      setSelectionMode(null);
    }
  }, [level, askedQuestions, selectionMode]);

  // Generate initial question options
  useEffect(() => {
    refreshQuestions();
  }, [refreshQuestions]);

  // Handle selecting a question from the bank
  const handleSelectBankQuestion = (question) => {
    setSelectedQuestion(question);
    setSelectionMode('bank');
    setCustomQuestion(''); // Clear custom input
  };

  // Handle typing in custom question
  const handleCustomQuestionChange = (e) => {
    setCustomQuestion(e.target.value);
    if (e.target.value.trim()) {
      setSelectionMode('custom');
      setSelectedQuestion(null); // Clear bank selection
    } else {
      setSelectionMode(null);
    }
  };

  // Submit the selected/custom question
  const handleAskQuestion = () => {
    if (selectionMode === 'bank' && selectedQuestion) {
      onQuestionSelected(selectedQuestion, false);
    } else if (selectionMode === 'custom' && customQuestion.trim()) {
      onQuestionSelected(customQuestion.trim(), true);
    }
  };

  const canAskQuestion = selectionMode === 'bank' || (selectionMode === 'custom' && customQuestion.trim().length >= 10);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Level Indicator */}
      <div className="text-center mb-6">
        <div className={`inline-block ${levelColor} text-white px-6 py-2 border-4 border-gray-900 rounded-lg font-pixel text-lg`}>
          LEVEL {level}: {levelName}
        </div>
      </div>

      {/* Header */}
      <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-8 mb-6">
        <h2 className="text-3xl font-pixel font-bold text-gray-800 text-center mb-3">
          YOU'RE ASKING <span className={`${levelColor.replace('bg-', 'text-')}`}>{targetPlayerName}</span> A QUESTION
        </h2>
        <p className="text-xl font-pixel text-gray-700 text-center leading-relaxed">
          SELECT A QUESTION FROM THE OPTIONS BELOW OR WRITE YOUR OWN
        </p>
      </div>

      {/* Question Options from Bank */}
      <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-pixel text-gray-800">CHOOSE A QUESTION:</h3>
          <button
            onClick={refreshQuestions}
            className="font-pixel text-lg text-warmAccent hover:text-orange-700 flex items-center gap-2 border-2 border-warmAccent px-3 py-1 rounded hover:bg-warmAccent hover:text-white active:translate-y-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            REFRESH
          </button>
        </div>

        <div className="space-y-3">
          {questionOptions.map((question, index) => (
            <button
              key={index}
              onClick={() => handleSelectBankQuestion(question)}
              className={`w-full text-left p-4 rounded-lg border-4 font-pixel text-lg ${
                selectedQuestion === question
                  ? `${levelColor} border-gray-900 text-white`
                  : 'bg-white border-amber-300 text-gray-800 hover:border-warmAccent active:translate-y-1'
              }`}
            >
              <p>{question}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Question Input */}
      <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-6 mb-6">
        <h3 className="text-2xl font-pixel text-gray-800 mb-4">OR WRITE YOUR OWN:</h3>
        <textarea
          value={customQuestion}
          onChange={handleCustomQuestionChange}
          placeholder="Type your custom question here..."
          className={`w-full p-4 border-4 rounded-lg resize-none focus:outline-none font-pixel text-lg bg-white ${
            selectionMode === 'custom'
              ? `${levelColor.replace('bg-', 'border-')}`
              : 'border-gray-400 focus:border-warmAccent'
          }`}
          rows={3}
          maxLength={500}
        />
        {customQuestion.trim().length > 0 && customQuestion.trim().length < 10 && (
          <p className="font-pixel text-lg text-red-600 mt-2">
            QUESTION MUST BE AT LEAST 10 CHARACTERS (CURRENTLY {customQuestion.trim().length})
          </p>
        )}
      </div>

      {/* Ask Question Button */}
      <div className="text-center">
        <button
          onClick={handleAskQuestion}
          disabled={!canAskQuestion}
          className={`px-8 py-4 rounded-lg font-pixel text-2xl border-4 ${
            canAskQuestion
              ? `${levelColor} text-white border-gray-900 hover:opacity-90 active:translate-y-1`
              : 'bg-gray-300 text-gray-500 border-gray-400 cursor-not-allowed'
          }`}
        >
          ASK QUESTION
        </button>
      </div>
    </div>
  );
}

export default memo(QuestionSelector);

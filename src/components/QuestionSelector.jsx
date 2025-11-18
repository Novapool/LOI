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
        <div className={`inline-block ${levelColor} text-white px-6 py-2 rounded-full font-semibold text-sm`}>
          Level {level}: {levelName}
        </div>
      </div>

      {/* Header */}
      <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
        <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">
          You're asking <span className={`${levelColor.replace('bg-', 'text-')}`}>{targetPlayerName}</span> a question
        </h2>
        <p className="text-gray-600 text-center">
          Select a question from the options below or write your own
        </p>
      </div>

      {/* Question Options from Bank */}
      <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Choose a question:</h3>
          <button
            onClick={refreshQuestions}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        <div className="space-y-3">
          {questionOptions.map((question, index) => (
            <button
              key={index}
              onClick={() => handleSelectBankQuestion(question)}
              className={`w-full text-left p-4 rounded-xl transition-all border-2 ${
                selectedQuestion === question
                  ? `${levelColor} border-transparent text-white shadow-lg scale-105`
                  : 'bg-gray-50 border-gray-200 text-gray-800 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <p className="text-base font-medium">{question}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Question Input */}
      <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Or write your own:</h3>
        <textarea
          value={customQuestion}
          onChange={handleCustomQuestionChange}
          placeholder="Type your custom question here..."
          className={`w-full p-4 border-2 rounded-xl resize-none focus:outline-none transition-all ${
            selectionMode === 'custom'
              ? `${levelColor.replace('bg-', 'border-')} shadow-lg`
              : 'border-gray-200 focus:border-gray-300'
          }`}
          rows={3}
          maxLength={500}
        />
        {customQuestion.trim().length > 0 && customQuestion.trim().length < 10 && (
          <p className="text-sm text-red-500 mt-2">
            Question must be at least 10 characters (currently {customQuestion.trim().length})
          </p>
        )}
      </div>

      {/* Ask Question Button */}
      <div className="text-center">
        <button
          onClick={handleAskQuestion}
          disabled={!canAskQuestion}
          className={`px-8 py-4 rounded-full font-bold text-lg shadow-lg transition-all ${
            canAskQuestion
              ? `${levelColor} text-white hover:scale-105 hover:shadow-xl`
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Ask Question
        </button>
      </div>
    </div>
  );
}

export default memo(QuestionSelector);

import { useMemo } from 'react';
import QuestionCard from './QuestionCard';
import QuestionSelector from './QuestionSelector';
import { GAME_CONFIG } from '../config';
import { supabase } from '../hooks/useGameState';

/**
 * GameScreen component - Active game UI with asker/answerer pattern
 *
 * @param {Object} props
 * @param {Object} props.gameState - Current game state
 * @param {string} props.playerId - Current player's ID
 */
export default function GameScreen({ gameState, playerId }) {

  // Get asker and answerer from circular player order
  const playerOrder = gameState.playerOrder || [];
  const askerPlayerId = playerOrder[gameState.currentAskerIndex];
  const answererPlayerId = playerOrder[gameState.currentAnswererIndex];

  const askerPlayer = gameState.players.find(p => p.id === askerPlayerId);
  const answererPlayer = gameState.players.find(p => p.id === answererPlayerId);

  const isAsker = askerPlayerId === playerId;
  const isAnswerer = answererPlayerId === playerId;

  // Memoize askedQuestions to prevent unnecessary re-renders from heartbeat updates
  // Only re-memoize when the actual content changes, not on object reference changes
  const memoizedAskedQuestions = useMemo(
    () => gameState.askedQuestions || [],
    [JSON.stringify(gameState.askedQuestions)]
  );

  // Handle asker selecting/writing a question
  const handleQuestionSelected = async (questionText, isCustom) => {
    try {
      const { data, error } = await supabase.rpc('set_question', {
        room_code_param: gameState.roomCode,
        player_id_param: playerId,
        question_text: questionText,
        is_custom_param: isCustom
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to set question');
      }

      // Realtime subscription will broadcast the question update automatically
    } catch (error) {
      console.error('Failed to set question:', error);
      alert(error.message || 'Failed to set question');
    }
  };

  // Handle answerer finishing their answer
  const handleNextTurn = async () => {
    try {
      // Call advance_turn RPC function
      const { data, error } = await supabase.rpc('advance_turn', {
        room_code_param: gameState.roomCode,
        player_id_param: playerId,
        current_question_param: gameState.currentQuestion
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to advance turn');
      }

      // Database trigger handles:
      // - Level transitions
      // - Circular order advancement (answerer becomes asker)
      // - Clearing current_question for next asker
      // Realtime subscription will broadcast changes automatically

    } catch (error) {
      console.error('Failed to advance turn:', error);
      alert(error.message || 'Failed to advance turn');
    }
  };

  if (gameState.status === GAME_CONFIG.STATUS.FINISHED) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-teal-900 to-blue-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Game Over!</h1>
          <p className="text-lg text-gray-600 mb-8">
            You've completed the Intimacy Ladder journey from deep vulnerability to casual conversation.
          </p>
          <p className="text-gray-700 mb-4">
            Thanks for playing with:
          </p>
          <div className="space-y-2 mb-8">
            {gameState.players.map((player) => (
              <div key={player.id} className="bg-gray-100 rounded-xl p-3 text-gray-800 font-medium">
                {player.name}
              </div>
            ))}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex justify-between items-center">
          <div className="text-white">
            <p className="text-sm opacity-80">Room Code</p>
            <p className="text-2xl font-bold tracking-wider">{gameState.roomCode}</p>
          </div>
          <div className="text-right text-white">
            <p className="text-sm opacity-80">Question</p>
            <p className="text-2xl font-bold">
              {gameState.questionCount + 1}/{gameState.settings.questionsPerLevel || GAME_CONFIG.QUESTIONS_PER_LEVEL}
            </p>
          </div>
        </div>
      </div>

      {/* Asker/Answerer Indicator */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 text-center">
          {isAsker && !gameState.currentQuestion ? (
            <div>
              <p className="text-white/80 text-sm mb-2">You are asking</p>
              <p className="text-white text-3xl font-bold">{answererPlayer?.name}</p>
              <p className="text-yellow-300 text-sm mt-2 font-semibold">Select or write a question!</p>
            </div>
          ) : isAnswerer && gameState.currentQuestion ? (
            <div>
              <p className="text-white/80 text-sm mb-2">{askerPlayer?.name} is asking you</p>
              <p className="text-yellow-300 text-sm mt-2 font-semibold">It's your turn to answer!</p>
            </div>
          ) : (
            <div>
              <p className="text-white/80 text-sm mb-2">Current Turn</p>
              <p className="text-white text-2xl font-bold">
                {askerPlayer?.name} → {answererPlayer?.name}
              </p>
              <p className="text-white/60 text-sm mt-2">
                {!gameState.currentQuestion ? 'Selecting question...' : 'Answering...'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mb-8">
        {/* Asker View: Question Selector */}
        {isAsker && !gameState.currentQuestion ? (
          <QuestionSelector
            level={gameState.currentLevel}
            askedQuestions={memoizedAskedQuestions}
            targetPlayerName={answererPlayer?.name}
            onQuestionSelected={handleQuestionSelected}
          />
        ) : gameState.currentQuestion ? (
          /* Everyone else: Question Card Display */
          <QuestionCard
            question={gameState.currentQuestion}
            level={gameState.currentLevel}
            isCustomQuestion={gameState.isCustomQuestion}
          />
        ) : (
          /* Waiting for asker to select question */
          <div className="w-full max-w-2xl mx-auto">
            <div className="bg-white rounded-3xl shadow-2xl p-12 text-center">
              <div className="animate-pulse">
                <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4"></div>
                <p className="text-xl text-gray-600">
                  Waiting for {askerPlayer?.name} to select a question...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player List */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
          <h3 className="text-white text-lg font-semibold mb-4">Players</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gameState.players.map((player) => {
              const isCurrentAsker = player.id === askerPlayerId;
              const isCurrentAnswerer = player.id === answererPlayerId;

              return (
                <div
                  key={player.id}
                  className={`rounded-xl p-3 text-center transition ${
                    isCurrentAsker
                      ? 'bg-blue-400 text-gray-900 font-bold border-2 border-blue-600'
                      : isCurrentAnswerer
                      ? 'bg-yellow-400 text-gray-900 font-bold border-2 border-yellow-600'
                      : 'bg-white/20 text-white'
                  }`}
                >
                  {player.name}
                  {isCurrentAsker && <div className="text-xs mt-1">Asking</div>}
                  {isCurrentAnswerer && <div className="text-xs mt-1">Answering</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Control Button */}
      <div className="max-w-2xl mx-auto">
        {isAnswerer && gameState.currentQuestion ? (
          <button
            onClick={handleNextTurn}
            className="w-full bg-green-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-600 transition transform hover:scale-105 shadow-lg"
          >
            I'm Done Answering
          </button>
        ) : (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 text-center text-white">
            {!gameState.currentQuestion
              ? `Waiting for ${askerPlayer?.name} to select a question...`
              : `Waiting for ${answererPlayer?.name} to finish answering...`
            }
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import QuestionCard from './QuestionCard';
import { GAME_CONFIG } from '../config';
import { getRandomQuestion } from '../data/questions';
import { supabase } from '../hooks/useGameState';

/**
 * GameScreen component - Active game UI
 *
 * @param {Object} props
 * @param {Object} props.gameState - Current game state
 * @param {string} props.playerId - Current player's ID
 * @param {Function} props.callEdgeFunction - Function to call Edge Functions
 */
export default function GameScreen({ gameState, playerId, callEdgeFunction }) {
  const [askedQuestions, setAskedQuestions] = useState([]);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isCurrentPlayer = currentPlayer?.id === playerId;

  // Initialize first question when game starts
  useEffect(() => {
    const setFirstQuestion = async () => {
      if (!gameState.currentQuestion && gameState.roomCode) {
        const firstQuestion = getRandomQuestion(gameState.currentLevel, askedQuestions);

        // Update question in database
        await supabase
          .from('game_state')
          .update({ current_question: firstQuestion })
          .eq('room_code', gameState.roomCode);

        setAskedQuestions([firstQuestion]);
      }
    };

    setFirstQuestion();
  }, [gameState.currentQuestion, gameState.roomCode]);

  const handleNextTurn = async () => {
    try {
      // Call next-turn Edge Function
      const result = await callEdgeFunction('next-turn', {
        roomCode: gameState.roomCode,
        playerId: playerId,
        currentQuestion: gameState.currentQuestion
      });

      if (result.gameFinished) {
        // Game finished - state will update via Realtime
        console.log('Game finished!');
        return;
      }

      if (result.success) {
        // Update asked questions locally
        setAskedQuestions([...askedQuestions, gameState.currentQuestion]);

        // Set the next question (server doesn't have question bank)
        if (!result.gameState.currentQuestion) {
          const nextQuestion = getRandomQuestion(
            result.gameState.currentLevel,
            askedQuestions
          );

          // Update question in database
          await supabase
            .from('game_state')
            .update({ current_question: nextQuestion })
            .eq('room_code', gameState.roomCode);
        }
      }
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
              {gameState.questionCount + 1}/{GAME_CONFIG.QUESTIONS_PER_LEVEL}
            </p>
          </div>
        </div>
      </div>

      {/* Current Player Indicator */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 text-center">
          <p className="text-white/80 text-sm mb-2">Current Player</p>
          <p className="text-white text-3xl font-bold">{currentPlayer?.name}</p>
          {isCurrentPlayer && (
            <p className="text-yellow-300 text-sm mt-2 font-semibold">It's your turn!</p>
          )}
        </div>
      </div>

      {/* Question Card */}
      <div className="mb-8">
        <QuestionCard
          question={gameState.currentQuestion || 'Loading...'}
          level={gameState.currentLevel}
        />
      </div>

      {/* Player List */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
          <h3 className="text-white text-lg font-semibold mb-4">Players</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gameState.players.map((player, idx) => (
              <div
                key={player.id}
                className={`rounded-xl p-3 text-center transition ${
                  idx === gameState.currentPlayerIndex
                    ? 'bg-yellow-400 text-gray-900 font-bold'
                    : 'bg-white/20 text-white'
                }`}
              >
                {player.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Control Button */}
      <div className="max-w-2xl mx-auto">
        {isCurrentPlayer ? (
          <button
            onClick={handleNextTurn}
            className="w-full bg-green-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-600 transition transform hover:scale-105 shadow-lg"
          >
            I'm Done Answering
          </button>
        ) : (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 text-center text-white">
            Waiting for {currentPlayer?.name} to finish answering...
          </div>
        )}
      </div>
    </div>
  );
}

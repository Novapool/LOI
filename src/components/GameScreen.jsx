import { useMemo, memo, useCallback, useEffect, useState } from 'react';
import QuestionCard from './QuestionCard';
import QuestionSelector from './QuestionSelector';
import PlayerBadge from './PlayerBadge';
import { GAME_CONFIG } from '../config';
import { supabase } from '../hooks/useGameState';
import { getRandomQuestion } from '../data/questions';

/**
 * GameScreen component - Active game UI with asker/answerer pattern
 *
 * @param {Object} props
 * @param {Object} props.gameState - Current game state
 * @param {string} props.playerId - Current player's ID
 */
function GameScreen({ gameState, playerId }) {
  // State for turn timeout tracking
  const [turnSkipMessage, setTurnSkipMessage] = useState(null);

  // Get asker and answerer from circular player order
  const playerOrder = gameState.playerOrder || [];
  const askerPlayerId = playerOrder[gameState.currentAskerIndex];
  const answererPlayerId = playerOrder[gameState.currentAnswererIndex];

  // Memoize player lookups to avoid repeated array searches
  const { askerPlayer, answererPlayer, isAsker, isAnswerer } = useMemo(() => {
    const asker = gameState.players.find(p => p.id === askerPlayerId);
    const answerer = gameState.players.find(p => p.id === answererPlayerId);
    return {
      askerPlayer: asker,
      answererPlayer: answerer,
      isAsker: askerPlayerId === playerId,
      isAnswerer: answererPlayerId === playerId
    };
  }, [gameState.players, askerPlayerId, answererPlayerId, playerId]);

  // Memoize askedQuestions to prevent unnecessary re-renders from heartbeat updates
  // Only re-memoize when the actual array reference changes
  const memoizedAskedQuestions = useMemo(
    () => gameState.askedQuestions || [],
    [gameState.askedQuestions]
  );

  // Handle asker selecting/writing a question - memoized to prevent re-creation
  const handleQuestionSelected = useCallback(async (questionText, isCustom) => {
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
      if (import.meta.env.DEV) {
        console.error('Failed to set question:', error);
      }
      alert(error.message || 'Failed to set question');
    }
  }, [gameState.roomCode, playerId]);

  // Handle answerer finishing their answer - memoized to prevent re-creation
  const handleNextTurn = useCallback(async () => {
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
      if (import.meta.env.DEV) {
        console.error('Failed to advance turn:', error);
      }
      alert(error.message || 'Failed to advance turn');
    }
  }, [gameState.roomCode, playerId, gameState.currentQuestion]);

  // Handle answerer rerolling a question - memoized to prevent re-creation
  const handleRerollQuestion = useCallback(async () => {
    try {
      // Call reroll_question RPC function to mark reroll as used
      const { data, error } = await supabase.rpc('reroll_question', {
        room_code_param: gameState.roomCode,
        player_id_param: playerId
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to reroll question');
      }

      // Generate new random question from local bank
      const newQuestion = getRandomQuestion(gameState.currentLevel, memoizedAskedQuestions);

      // Set the new question using existing set_question RPC
      const { data: setData, error: setError } = await supabase.rpc('set_question', {
        room_code_param: gameState.roomCode,
        player_id_param: askerPlayerId, // Asker sets the question (on behalf of answerer's reroll)
        question_text: newQuestion,
        is_custom_param: false
      });

      if (setError) {
        throw setError;
      }

      if (!setData?.success) {
        throw new Error(setData?.error || 'Failed to set new question');
      }

      // Realtime subscription will broadcast the question update automatically

    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to reroll question:', error);
      }
      alert(error.message || 'Failed to reroll question');
    }
  }, [gameState.roomCode, playerId, gameState.currentLevel, memoizedAskedQuestions, askerPlayerId]);

  // Turn timeout monitoring - checks if disconnected player's turn should be skipped
  useEffect(() => {
    // Only monitor during active gameplay
    if (gameState.status !== GAME_CONFIG.STATUS.PLAYING) return;

    // Only check if asker is disconnected
    if (!askerPlayer?.isDisconnected) {
      setTurnSkipMessage(null);
      return;
    }

    // Check turn timeout every 10 seconds
    const intervalId = setInterval(async () => {
      try {
        const { data, error } = await supabase.rpc('check_turn_timeout', {
          room_code_param: gameState.roomCode
        });

        if (error) {
          if (import.meta.env.DEV) {
            console.error('Turn timeout check failed:', error);
          }
          return;
        }

        if (data?.skipped) {
          // Turn was auto-skipped
          setTurnSkipMessage(`${data.skippedPlayerName} was skipped (disconnected)`);
          // Clear message after 5 seconds
          setTimeout(() => setTurnSkipMessage(null), 5000);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('Turn timeout error:', err);
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [gameState.status, gameState.roomCode, askerPlayer?.isDisconnected]);

  if (gameState.status === GAME_CONFIG.STATUS.FINISHED) {
    return (
      <div className="min-h-screen stars-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-amber-50 border-4 border-woodBrown rounded-lg p-8 text-center">
          <h1 className="text-5xl font-pixel font-bold text-gray-800 mb-6">GAME OVER!</h1>
          <p className="text-xl font-pixel text-gray-700 mb-8 leading-relaxed">
            YOU'VE COMPLETED THE INTIMACY LADDER JOURNEY FROM DEEP VULNERABILITY TO CASUAL CONVERSATION.
          </p>
          <p className="text-2xl font-pixel text-gray-800 mb-4">
            THANKS FOR PLAYING WITH:
          </p>
          <div className="space-y-2 mb-8">
            {gameState.players.map((player) => (
              <div key={player.id} className="bg-amber-100 border-2 border-amber-300 rounded-lg p-3 text-gray-800 font-pixel text-xl">
                {player.name}
              </div>
            ))}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-warmAccent text-white border-4 border-woodBrown py-4 rounded-lg font-pixel text-2xl hover:bg-orange-600 active:translate-y-1"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen stars-bg p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-4 flex justify-between items-center">
          <div className="text-gray-800">
            <p className="text-lg font-pixel">ROOM CODE</p>
            <p className="text-3xl font-pixel font-bold tracking-wider">{gameState.roomCode}</p>
          </div>
          <div className="text-right text-gray-800">
            <p className="text-lg font-pixel">QUESTION</p>
            <p className="text-3xl font-pixel font-bold">
              {gameState.questionCount + 1}/{gameState.settings.questionsPerLevel || GAME_CONFIG.QUESTIONS_PER_LEVEL}
            </p>
          </div>
        </div>
      </div>

      {/* Turn Skip Message */}
      {turnSkipMessage && (
        <div className="max-w-4xl mx-auto mb-8">
          <div className="bg-orange-100 border-4 border-orange-400 rounded-lg p-4 text-center animate-pulse">
            <p className="text-xl font-pixel text-orange-800">{turnSkipMessage}</p>
          </div>
        </div>
      )}

      {/* Asker/Answerer Indicator */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-6 text-center">
          {isAsker && !gameState.currentQuestion ? (
            <div>
              <p className="text-gray-700 text-xl font-pixel mb-2">YOU ARE ASKING</p>
              <p className="text-warmAccent text-4xl font-pixel font-bold">{answererPlayer?.name}</p>
              <p className="text-level2 text-xl font-pixel mt-2">SELECT OR WRITE A QUESTION!</p>
            </div>
          ) : isAnswerer && gameState.currentQuestion ? (
            <div>
              <p className="text-gray-700 text-xl font-pixel mb-2">{askerPlayer?.name} IS ASKING YOU</p>
              <p className="text-level2 text-xl font-pixel mt-2">IT'S YOUR TURN TO ANSWER!</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-700 text-xl font-pixel mb-2">CURRENT TURN</p>
              <p className="text-warmAccent text-3xl font-pixel font-bold">
                {askerPlayer?.name} → {answererPlayer?.name}
              </p>
              <p className="text-gray-600 text-lg font-pixel mt-2">
                {!gameState.currentQuestion ? 'SELECTING QUESTION...' : 'ANSWERING...'}
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
            isAnswerer={isAnswerer}
            rerollsUsed={gameState.rerollsUsed || {}}
            playerId={playerId}
            onReroll={handleRerollQuestion}
          />
        ) : (
          /* Waiting for asker to select question */
          <div className="w-full max-w-2xl mx-auto">
            <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-12 text-center">
              <div className="animate-pulse">
                <div className="w-16 h-16 bg-amber-200 border-4 border-amber-400 mx-auto mb-4"></div>
                <p className="text-2xl font-pixel text-gray-700">
                  WAITING FOR {askerPlayer?.name} TO SELECT A QUESTION...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player List */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-6">
          <h3 className="text-gray-800 text-2xl font-pixel mb-4">PLAYERS</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gameState.players.map((player) => (
              <PlayerBadge
                key={player.id}
                player={player}
                isCurrentAsker={player.id === askerPlayerId}
                isCurrentAnswerer={player.id === answererPlayerId}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Control Button */}
      <div className="max-w-2xl mx-auto">
        {isAnswerer && gameState.currentQuestion ? (
          <button
            onClick={handleNextTurn}
            className="w-full bg-level3 text-white border-4 border-green-800 py-4 rounded-lg font-pixel text-2xl hover:bg-yellow-500 active:translate-y-1"
          >
            I'M DONE ANSWERING
          </button>
        ) : (
          <div className="bg-amber-50 border-4 border-woodBrown rounded-lg p-4 text-center text-gray-800 font-pixel text-xl">
            {!gameState.currentQuestion
              ? `WAITING FOR ${askerPlayer?.name} TO SELECT A QUESTION...`
              : `WAITING FOR ${answererPlayer?.name} TO FINISH ANSWERING...`
            }
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(GameScreen);

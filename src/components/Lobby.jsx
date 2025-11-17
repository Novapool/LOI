import { useState } from 'react';
import { GAME_CONFIG } from '../config';

/**
 * Lobby component - Pre-game room with player list
 *
 * @param {Object} props
 * @param {Object} props.gameState - Current game state
 * @param {Function} props.updateGameState - Function to update game state
 * @param {string} props.playerId - Current player's ID
 * @param {boolean} props.isHost - Whether current player is the host
 */
export default function Lobby({ gameState, updateGameState, playerId, isHost }) {
  const [playerName, setPlayerName] = useState('');
  const [hasJoined, setHasJoined] = useState(false);

  const handleJoinGame = (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    const newPlayer = {
      id: playerId,
      name: playerName.trim(),
      isHost: gameState.players.length === 0 // First player is host
    };

    updateGameState({
      players: [...gameState.players, newPlayer]
    });

    setHasJoined(true);
  };

  const handleStartGame = () => {
    if (gameState.players.length < GAME_CONFIG.MIN_PLAYERS) {
      alert(`Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start!`);
      return;
    }

    // Select random first player
    const randomPlayerIndex = Math.floor(Math.random() * gameState.players.length);

    updateGameState({
      status: GAME_CONFIG.STATUS.PLAYING,
      currentLevel: 5, // Start at most intimate level
      currentPlayerIndex: randomPlayerIndex,
      questionCount: 0
    });
  };

  const canStart = isHost && gameState.players.length >= GAME_CONFIG.MIN_PLAYERS;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8">
        {/* Room Code Display */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Intimacy Ladder</h1>
          <div className="bg-gray-100 rounded-xl p-4">
            <p className="text-sm text-gray-600 mb-1">Room Code</p>
            <p className="text-5xl font-black text-indigo-600 tracking-wider">{gameState.roomCode}</p>
          </div>
        </div>

        {/* Join Form or Player List */}
        {!hasJoined ? (
          <form onSubmit={handleJoinGame} className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter your name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              maxLength={20}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
              autoFocus
            />
            <button
              type="submit"
              className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition transform hover:scale-105"
            >
              Join Game
            </button>
          </form>
        ) : (
          <div className="mb-8">
            {/* Player List */}
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Players ({gameState.players.length}/{GAME_CONFIG.MAX_PLAYERS})
            </h2>
            <div className="space-y-2">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className="bg-gray-50 rounded-xl p-3 flex items-center justify-between"
                >
                  <span className="font-medium text-gray-800">{player.name}</span>
                  {player.isHost && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Start Game Button (Host Only) */}
            {isHost && (
              <button
                onClick={handleStartGame}
                disabled={!canStart}
                className={`w-full mt-6 py-3 rounded-xl font-semibold transition transform ${
                  canStart
                    ? 'bg-green-600 text-white hover:bg-green-700 hover:scale-105'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {canStart
                  ? 'Start Game'
                  : `Need ${GAME_CONFIG.MIN_PLAYERS - gameState.players.length} more player(s)`}
              </button>
            )}

            {/* Waiting Message (Non-Host) */}
            {!isHost && (
              <p className="text-center text-gray-600 mt-6 text-sm">
                Waiting for host to start the game...
              </p>
            )}
          </div>
        )}

        {/* Game Info */}
        <div className="bg-indigo-50 rounded-xl p-4 text-sm text-gray-700">
          <p className="font-semibold mb-2">How to Play:</p>
          <ul className="space-y-1 text-xs">
            <li>• Start with the most intimate questions (Level 5)</li>
            <li>• Take turns answering questions</li>
            <li>• Work your way down to small talk (Level 1)</li>
            <li>• Be honest, be vulnerable, have fun!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

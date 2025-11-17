import { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import { useGameState, supabase } from './hooks/useGameState';
import { GAME_CONFIG } from './config';

/**
 * Main App component - Handles routing and game state management
 */
function App() {
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creatorName, setCreatorName] = useState('');

  // Initialize player ID on mount using crypto.randomUUID()
  useEffect(() => {
    const id = crypto.randomUUID();
    setPlayerId(id);
  }, []);

  // Use Postgres Realtime hook
  const { gameState, isConnected, error } = useGameState(roomCode, playerId);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!creatorName.trim()) return;

    try {
      // Call create_game_room RPC function (replaces Edge Function)
      const { data, error } = await supabase.rpc('create_game_room', {
        player_name: creatorName.trim(),
        player_id: playerId,
        game_settings: {
          startLevel: 5,
          questionsPerLevel: 3
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        // Room code is already uppercase from database
        setRoomCode(data.room.roomCode);
      } else {
        throw new Error(data?.error || 'Failed to create room');
      }
    } catch (error) {
      console.error('Failed to create room:', error);
      alert(`Failed to create room: ${error.message}`);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    const normalizedCode = joinCode.trim().toUpperCase();
    if (normalizedCode.length !== 4) {
      alert('Please enter a valid 4-character room code');
      return;
    }
    // Normalize to uppercase once here
    setRoomCode(normalizedCode);
  };

  // Landing page - Create or Join room
  if (!roomCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 text-center">Intimacy Ladder</h1>
          <p className="text-gray-600 text-center mb-8">
            A party game that flips conversation on its head
          </p>

          {!isJoining && !isCreating ? (
            <div className="space-y-4">
              <button
                onClick={() => setIsCreating(true)}
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition transform hover:scale-105"
              >
                Create New Game
              </button>
              <button
                onClick={() => setIsJoining(true)}
                className="w-full bg-gray-200 text-gray-800 py-4 rounded-xl font-semibold text-lg hover:bg-gray-300 transition"
              >
                Join Existing Game
              </button>
            </div>
          ) : isCreating ? (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter your name
                </label>
                <input
                  type="text"
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition"
              >
                Create Game
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="w-full bg-gray-200 text-gray-800 py-3 rounded-xl font-semibold hover:bg-gray-300 transition"
              >
                Back
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Room Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCD"
                  maxLength={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl font-bold tracking-wider focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition"
              >
                Join Game
              </button>
              <button
                type="button"
                onClick={() => setIsJoining(false)}
                className="w-full bg-gray-200 text-gray-800 py-3 rounded-xl font-semibold hover:bg-gray-300 transition"
              >
                Back
              </button>
            </form>
          )}

          {/* Info */}
          <div className="mt-8 bg-indigo-50 rounded-xl p-4 text-sm text-gray-700">
            <p className="font-semibold mb-2">What is Intimacy Ladder?</p>
            <p className="text-xs">
              A multiplayer game where you start with deep, vulnerable questions and work your way down
              to small talk. Perfect for parties, dates, or getting to know people on a deeper level.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show connection error if Supabase is not configured
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-pink-900 to-purple-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Connection Error</h1>
          <p className="text-gray-700 mb-4">{error}</p>
          <p className="text-sm text-gray-600 mb-4">
            Please make sure you have:
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 mb-6">
            <li>Created a Supabase project</li>
            <li>Copied .env.example to .env.local</li>
            <li>Added your Supabase URL and anon key to .env.local</li>
            <li>Restarted the dev server</li>
          </ol>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while connecting
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p className="text-xl font-semibold">Connecting to room {roomCode}...</p>
        </div>
      </div>
    );
  }

  // Render appropriate screen based on game status
  return gameState.status === GAME_CONFIG.STATUS.LOBBY ? (
    <Lobby
      gameState={gameState}
      playerId={playerId}
    />
  ) : (
    <GameScreen
      gameState={gameState}
      playerId={playerId}
    />
  );
}

export default App;

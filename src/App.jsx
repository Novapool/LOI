import { useState, useEffect, useCallback } from 'react';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import ReconnectPrompt from './components/ReconnectPrompt';
import CampfireAnimation from './components/CampfireAnimation';
import { useGameState, supabase } from './hooks/useGameState';
import { GAME_CONFIG } from './config';
import { saveSession, loadSession, clearSession } from './utils/sessionManager';

/**
 * Main App component - Handles routing and game state management
 */
function App() {
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [pendingSession, setPendingSession] = useState(null);

  // Initialize player ID and check for existing session on mount
  useEffect(() => {
    // Check for existing session
    const existingSession = loadSession();

    if (existingSession) {
      // Show reconnect prompt
      setPendingSession(existingSession);
      setShowReconnectPrompt(true);
      setPlayerId(existingSession.playerId);
      setSessionToken(existingSession.sessionToken);
    } else {
      // Generate new player ID
      const id = crypto.randomUUID();
      setPlayerId(id);
    }
  }, []);

  // Use Postgres Realtime hook
  const { gameState, isConnected, error } = useGameState(roomCode, playerId);

  // Handle reconnection attempt
  const handleReconnect = useCallback(async () => {
    if (!pendingSession) return { success: false };

    try {
      const { data, error } = await supabase.rpc('reconnect_player', {
        room_code_param: pendingSession.roomCode,
        player_id_param: pendingSession.playerId,
        session_token_param: pendingSession.sessionToken
      });

      if (error) throw error;

      if (data?.success) {
        // Reconnection successful - restore room
        setRoomCode(pendingSession.roomCode);
        setShowReconnectPrompt(false);
        setPendingSession(null);
        return { success: true };
      } else {
        // Session expired or invalid
        clearSession();
        return {
          success: false,
          message: data?.message || 'Session expired. Please rejoin the room.'
        };
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
      clearSession();
      return {
        success: false,
        message: error.message || 'Failed to reconnect'
      };
    }
  }, [pendingSession]);

  // Handle "start fresh" from reconnect prompt
  const handleStartFresh = useCallback(() => {
    clearSession();
    setShowReconnectPrompt(false);
    setPendingSession(null);
    // Generate new player ID
    const newId = crypto.randomUUID();
    setPlayerId(newId);
    setSessionToken('');
  }, []);

  const handleCreateRoom = useCallback(async (e) => {
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

        // Save session with token for reconnection
        const sessionData = {
          playerId: data.player.id,
          sessionToken: data.player.sessionToken,
          roomCode: data.room.roomCode,
          playerName: data.player.name,
          joinedAt: new Date().toISOString()
        };
        saveSession(sessionData);
        setSessionToken(data.player.sessionToken);
      } else {
        throw new Error(data?.error || 'Failed to create room');
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to create room:', error);
      }
      alert(`Failed to create room: ${error.message}`);
    }
  }, [creatorName, playerId]);

  const handleJoinRoom = useCallback((e) => {
    e.preventDefault();
    const normalizedCode = joinCode.trim().toUpperCase();
    if (normalizedCode.length !== 4) {
      alert('Please enter a valid 4-character room code');
      return;
    }
    // Normalize to uppercase once here
    setRoomCode(normalizedCode);
  }, [joinCode]);

  // Memoized handlers to prevent unnecessary re-renders
  const handleShowCreateForm = useCallback(() => setIsCreating(true), []);
  const handleShowJoinForm = useCallback(() => setIsJoining(true), []);
  const handleBackFromCreate = useCallback(() => setIsCreating(false), []);
  const handleBackFromJoin = useCallback(() => setIsJoining(false), []);
  const handleRetry = useCallback(() => window.location.reload(), []);

  // Show reconnect prompt if previous session exists
  if (showReconnectPrompt && pendingSession) {
    return (
      <ReconnectPrompt
        sessionData={pendingSession}
        onReconnect={handleReconnect}
        onStartFresh={handleStartFresh}
      />
    );
  }

  // Landing page - Create or Join room
  if (!roomCode) {
    return (
      <div className="min-h-screen stars-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-amber-50 border-4 border-woodBrown rounded-lg p-8">
          {/* Campfire decoration */}
          <div className="flex justify-center mb-6">
            <CampfireAnimation />
          </div>

          <h1 className="text-5xl font-pixel font-bold text-gray-800 mb-3 text-center tracking-wide">SURFACE LEVEL</h1>
          <p className="text-xl font-pixel text-gray-700 text-center mb-8">
            A party game that flips conversation on its head
          </p>

          {!isJoining && !isCreating ? (
            <div className="space-y-4">
              <button
                onClick={handleShowCreateForm}
                className="w-full bg-warmAccent text-white border-4 border-woodBrown py-4 rounded-lg font-pixel text-2xl hover:bg-orange-600 active:translate-y-1"
              >
                CREATE NEW GAME
              </button>
              <button
                onClick={handleShowJoinForm}
                className="w-full bg-amber-200 text-gray-800 border-4 border-woodBrown py-4 rounded-lg font-pixel text-2xl hover:bg-amber-300 active:translate-y-1"
              >
                JOIN EXISTING GAME
              </button>
            </div>
          ) : isCreating ? (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xl font-pixel text-gray-700 mb-2">
                  ENTER YOUR NAME
                </label>
                <input
                  type="text"
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  className="w-full px-4 py-3 border-4 border-gray-400 rounded-lg font-pixel text-xl focus:border-warmAccent outline-none bg-white"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="w-full bg-warmAccent text-white border-4 border-woodBrown py-4 rounded-lg font-pixel text-2xl hover:bg-orange-600 active:translate-y-1"
              >
                CREATE GAME
              </button>
              <button
                type="button"
                onClick={handleBackFromCreate}
                className="w-full bg-amber-200 text-gray-800 border-4 border-woodBrown py-3 rounded-lg font-pixel text-xl hover:bg-amber-300 active:translate-y-1"
              >
                BACK
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xl font-pixel text-gray-700 mb-2">
                  ENTER ROOM CODE
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCD"
                  maxLength={4}
                  className="w-full px-4 py-3 border-4 border-gray-400 rounded-lg text-center text-3xl font-pixel tracking-wider focus:border-warmAccent outline-none bg-white"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="w-full bg-warmAccent text-white border-4 border-woodBrown py-4 rounded-lg font-pixel text-2xl hover:bg-orange-600 active:translate-y-1"
              >
                JOIN GAME
              </button>
              <button
                type="button"
                onClick={handleBackFromJoin}
                className="w-full bg-amber-200 text-gray-800 border-4 border-woodBrown py-3 rounded-lg font-pixel text-xl hover:bg-amber-300 active:translate-y-1"
              >
                BACK
              </button>
            </form>
          )}

          {/* Info */}
          <div className="mt-8 bg-amber-100 border-4 border-amber-300 rounded-lg p-4 font-pixel text-gray-800">
            <p className="text-xl mb-2">WHAT IS SURFACE LEVEL?</p>
            <p className="text-lg leading-relaxed">
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
      <div className="min-h-screen stars-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-red-100 border-4 border-red-600 rounded-lg p-8">
          <h1 className="text-3xl font-pixel font-bold text-red-700 mb-4">CONNECTION ERROR</h1>
          <p className="text-xl font-pixel text-gray-800 mb-4">{error}</p>
          <p className="text-lg font-pixel text-gray-700 mb-4">
            PLEASE MAKE SURE YOU HAVE:
          </p>
          <ol className="list-decimal list-inside text-lg font-pixel text-gray-700 space-y-2 mb-6 ml-4">
            <li>Created a Supabase project</li>
            <li>Copied .env.example to .env.local</li>
            <li>Added your Supabase URL and anon key to .env.local</li>
            <li>Restarted the dev server</li>
          </ol>
          <button
            onClick={handleRetry}
            className="w-full bg-red-600 text-white border-4 border-red-800 py-3 rounded-lg font-pixel text-2xl hover:bg-red-700 active:translate-y-1"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while connecting
  if (!isConnected) {
    return (
      <div className="min-h-screen stars-bg flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <CampfireAnimation />
          </div>
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-warmAccent border-t-transparent mx-auto mb-4"></div>
          <p className="text-2xl font-pixel text-amber-200">CONNECTING TO ROOM {roomCode}...</p>
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

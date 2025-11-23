import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * ReconnectPrompt Component
 * Modal that appears when a previous session is detected
 * Gives user option to reconnect or start fresh
 */
function ReconnectPrompt({ sessionData, onReconnect, onStartFresh }) {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState(null);

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setError(null);

    try {
      const result = await onReconnect();

      // If reconnection failed, show error
      if (!result || !result.success) {
        setError(result?.message || 'Session expired. Please start fresh.');
        setIsReconnecting(false);
      }
      // If successful, parent component will handle navigation
    } catch (err) {
      setError(err.message || 'Failed to reconnect. Please start fresh.');
      setIsReconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div className="max-w-md w-full bg-amber-50 border-4 border-woodBrown rounded-lg p-8 shadow-2xl">
        {/* Icon */}
        <div className="text-center mb-4">
          <div className="text-6xl mb-2">🔥</div>
          <h2 className="text-3xl font-pixel font-bold text-gray-800 mb-2">
            WELCOME BACK
          </h2>
        </div>

        {/* Session info */}
        <div className="bg-amber-100 border-2 border-amber-400 rounded-lg p-4 mb-6">
          <p className="font-pixel text-lg text-gray-800 mb-2">
            You were in a game as:
          </p>
          <p className="font-pixel text-2xl text-warmAccent font-bold mb-1">
            {sessionData.playerName}
          </p>
          <p className="font-pixel text-xl text-gray-700">
            Room: <span className="font-bold">{sessionData.roomCode}</span>
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-100 border-2 border-red-400 rounded-lg p-4 mb-4">
            <p className="font-pixel text-lg text-red-700">{error}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="w-full bg-warmAccent text-white border-4 border-woodBrown py-4 rounded-lg font-pixel text-2xl hover:bg-orange-600 active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReconnecting ? 'RECONNECTING...' : 'RECONNECT'}
          </button>

          {!isReconnecting && (
            <button
              onClick={onStartFresh}
              className="w-full bg-amber-200 text-gray-800 border-4 border-woodBrown py-4 rounded-lg font-pixel text-xl hover:bg-amber-300 active:translate-y-1"
            >
              START FRESH
            </button>
          )}
        </div>

        {/* Helper text */}
        <div className="mt-6 text-center">
          <p className="font-pixel text-sm text-gray-600">
            Sessions expire after 5 minutes of disconnection
          </p>
        </div>
      </div>
    </div>
  );
}

ReconnectPrompt.propTypes = {
  sessionData: PropTypes.shape({
    playerId: PropTypes.string.isRequired,
    sessionToken: PropTypes.string.isRequired,
    roomCode: PropTypes.string.isRequired,
    playerName: PropTypes.string.isRequired,
    joinedAt: PropTypes.string
  }).isRequired,
  onReconnect: PropTypes.func.isRequired,
  onStartFresh: PropTypes.func.isRequired
};

export default ReconnectPrompt;

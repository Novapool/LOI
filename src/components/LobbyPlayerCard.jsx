import { memo } from 'react';

/**
 * LobbyPlayerCard component - Displays a single player card in lobby
 * Memoized to prevent unnecessary re-renders
 *
 * @param {Object} props
 * @param {Object} props.player - Player object (id, name, isHost, isDisconnected, disconnectedAt)
 * @param {boolean} props.isHost - Whether this player is the host
 */
function LobbyPlayerCard({ player, isHost }) {
  const isDisconnected = player.isDisconnected || false;

  return (
    <div className={`bg-amber-100 border-2 rounded-lg p-3 flex items-center justify-between ${
      isDisconnected ? 'border-gray-400 opacity-60' : 'border-amber-300'
    }`}>
      <div className="flex items-center gap-2">
        <span className={`font-pixel text-xl ${isDisconnected ? 'text-gray-500' : 'text-gray-800'}`}>
          {player.name}
        </span>
        {isDisconnected && (
          <span className="font-pixel text-xs bg-gray-500 text-white px-2 py-1 rounded">
            DISCONNECTED
          </span>
        )}
      </div>
      {isHost && !isDisconnected && (
        <span className="font-pixel text-sm bg-warmAccent text-white px-3 py-1 rounded border-2 border-woodBrown">
          HOST
        </span>
      )}
      {isHost && isDisconnected && (
        <span className="font-pixel text-sm bg-gray-600 text-white px-3 py-1 rounded border-2 border-gray-700">
          HOST
        </span>
      )}
    </div>
  );
}

export default memo(LobbyPlayerCard);

import { memo } from 'react';

/**
 * LobbyPlayerCard component - Displays a single player card in lobby
 * Memoized to prevent unnecessary re-renders
 *
 * @param {Object} props
 * @param {Object} props.player - Player object
 * @param {boolean} props.isHost - Whether this player is the host
 */
function LobbyPlayerCard({ player, isHost }) {
  return (
    <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-3 flex items-center justify-between">
      <span className="font-pixel text-xl text-gray-800">{player.name}</span>
      {isHost && (
        <span className="font-pixel text-sm bg-warmAccent text-white px-3 py-1 rounded border-2 border-woodBrown">
          HOST
        </span>
      )}
    </div>
  );
}

export default memo(LobbyPlayerCard);

import { memo } from 'react';

/**
 * PlayerBadge component - Displays a single player badge
 * Memoized to prevent unnecessary re-renders
 *
 * @param {Object} props
 * @param {Object} props.player - Player object
 * @param {boolean} props.isCurrentAsker - Whether this player is asking
 * @param {boolean} props.isCurrentAnswerer - Whether this player is answering
 */
function PlayerBadge({ player, isCurrentAsker, isCurrentAnswerer }) {
  return (
    <div
      className={`rounded-lg p-3 text-center font-pixel border-4 ${
        isCurrentAsker
          ? 'bg-level4 text-white font-bold border-red-900'
          : isCurrentAnswerer
          ? 'bg-level2 text-gray-900 font-bold border-yellow-600'
          : 'bg-amber-100 text-gray-700 border-amber-300'
      }`}
    >
      <div className="text-lg">{player.name}</div>
      {isCurrentAsker && <div className="text-sm mt-1">ASKING</div>}
      {isCurrentAnswerer && <div className="text-sm mt-1">ANSWERING</div>}
    </div>
  );
}

export default memo(PlayerBadge);

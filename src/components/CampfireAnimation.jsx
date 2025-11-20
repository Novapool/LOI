export default function CampfireAnimation() {
  return (
    <div className="campfire-container flex flex-col items-center gap-1">
      {/* Flame - Simple 3-frame flicker */}
      <div className="campfire-flicker">
        <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          {/* Outer flame - orange */}
          <path
            d="M24 8 L28 16 L32 20 L32 28 L28 32 L20 32 L16 28 L16 20 L20 16 Z"
            fill="#D84000"
          />
          {/* Middle flame - golden */}
          <path
            d="M24 12 L27 18 L28 24 L26 28 L22 28 L20 24 L21 18 Z"
            fill="#F59E0B"
          />
          {/* Inner flame - yellow */}
          <path
            d="M24 16 L26 20 L26 24 L24 26 L22 24 L22 20 Z"
            fill="#FCD34D"
          />
        </svg>
      </div>

      {/* Logs - static */}
      <div className="flex gap-1">
        <div className="w-8 h-2 bg-woodBrown rounded-sm"></div>
        <div className="w-8 h-2 bg-woodBrown rounded-sm"></div>
      </div>
    </div>
  );
}

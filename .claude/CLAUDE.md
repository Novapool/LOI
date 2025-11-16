# Intimacy Ladder - Claude Project Context

## Project Overview

**Intimacy Ladder** is a real-time multiplayer party game where players answer progressively *less* vulnerable questions, starting from deep philosophical topics (Level 5) and working backwards to surface-level small talk (Level 1).

**Game Concept:** Flip traditional conversation progression by starting with the most intimate questions first, creating a unique social dynamic that facilitates rapid bonding among players.

---

## Architecture

### Stack Summary
- **Frontend:** React + Tailwind CSS
- **Real-time:** Supabase Realtime Broadcast (WebSocket)
- **Deployment:** Vercel (frontend) + Supabase (infrastructure)
- **Database:** None (fully ephemeral)

### Key Architectural Decisions

1. **No Backend Server**
   - All game logic runs client-side
   - Supabase Realtime handles state synchronization only
   - No custom API endpoints needed

2. **Ephemeral State**
   - Rooms exist only while players are connected
   - No persistence to database
   - Room codes are randomly generated and disposable

3. **Broadcast-Based Sync**
   - Uses Supabase Broadcast channels (not Postgres CDC)
   - Each room = one channel (e.g., `game:XK7D`)
   - All clients subscribe and broadcast state changes

---

## Information Flow Architecture

### 1. Room Creation
```
User Input (name + "Create Game")
  ↓
Frontend generates 4-char room code
  ↓
Subscribe to Supabase channel `game:{code}`
  ↓
Initialize local game state:
  {
    roomCode: "XK7D",
    players: [{name: "Laith", id: uuid()}],
    status: "lobby",
    settings: {startLevel: 5, questionsPerLevel: 3}
  }
  ↓
Broadcast initial state to channel
```

### 2. Player Joining
```
User Input (name + room code)
  ↓
Subscribe to existing channel `game:{code}`
  ↓
Receive current game state from channel
  ↓
Broadcast "player_joined" event with new player data
  ↓
All devices update player list in real-time
```

### 3. Game Start
```
Host clicks "Start Game"
  ↓
Frontend:
  - Sets status: "playing"
  - Sets currentLevel: 5
  - Selects random first player (currentPlayerIndex: 0-N)
  - Pulls random question from Level 5 pool
  ↓
Broadcast complete game state
  ↓
All devices render game screen with highlighted current player
```

### 4. Turn Progression
```
Current player clicks "Done Answering"
  ↓
Frontend:
  - Increment question counter for current level
  - Select next random player (excluding current)
  - Pull new random question
  - Check if level should decrease (after N questions)
  ↓
Broadcast updated state:
  {
    currentLevel: 5,
    currentPlayerIndex: 2,
    currentQuestion: "What would you die for?",
    questionCount: 2
  }
  ↓
All devices:
  - Update highlighted player
  - Display new question
  - Animate level change if applicable
```

### 5. Level Transitions
```
After N questions at current level:
  ↓
Frontend decrements level (5 → 4 → 3 → 2 → 1)
  ↓
Broadcast state with:
  - currentLevel: 4
  - currentQuestion: (new random from Level 4 pool)
  - questionCount: 0 (reset)
  ↓
All devices show level transition animation
```

---

## Data Models

### Game State (Client-Side)
```javascript
{
  roomCode: string,              // e.g., "XK7D"
  status: "lobby" | "playing" | "finished",
  players: [
    {
      id: string,                // UUID
      name: string,              // User-provided
      isHost: boolean
    }
  ],
  settings: {
    startLevel: 1-5,             // Configurable by host
    questionsPerLevel: number    // Default: 3
  },
  currentLevel: 1-5,
  currentPlayerIndex: number,    // Index in players array
  currentQuestion: string,
  questionCount: number          // Per-level counter
}
```

### Broadcast Events
```javascript
// Player joins
{ type: "player_joined", player: {id, name} }

// Game state update
{ type: "state_update", state: {currentLevel, currentPlayerIndex, ...} }

// Player leaves
{ type: "player_left", playerId: string }
```

---

## Question Bank Structure

```javascript
// src/data/questions.js
export const questions = {
  5: [
    "What would you sacrifice everything for?",
    "What keeps you awake at 3am?",
    "Who are you when no one is watching?",
    // 20-30 Level 5 questions
  ],
  4: [
    "When did you last cry alone?",
    "What fear controls your life?",
    "What do you never want your parents to know?",
    // 20-30 Level 4 questions
  ],
  3: [
    "What belief have you completely reversed?",
    "What makes someone worthy of respect?",
    "What's your most controversial value?",
    // 20-30 Level 3 questions
  ],
  2: [
    "What's your most unpopular opinion?",
    "What talent do you wish you had?",
    "What's a hidden passion of yours?",
    // 20-30 Level 2 questions
  ],
  1: [
    "What's your job?",
    "Where are you from?",
    "What are your hobbies?",
    // 20-30 Level 1 questions
  ]
}
```

---

## Component Architecture

### App.jsx
- Root component
- Handles routing between screens
- Manages Supabase connection

### Lobby.jsx (Pre-Game)
**Props:** `roomCode`, `players`, `isHost`, `onStartGame`

**Responsibilities:**
- Display room code prominently
- Show connected players list
- Host controls (start level, questions per level)
- "Start Game" button (host only)

### GameScreen.jsx (Active Game)
**Props:** `gameState`, `onAnswerComplete`

**Responsibilities:**
- Display current question in large text
- Highlight current player
- Show current level indicator
- "I'm Done Answering" button (current player only)
- Level transition animations

### QuestionCard.jsx
**Props:** `question`, `level`, `isActive`

**Responsibilities:**
- Display question text
- Visual styling per level (color-coded)
- Fade-in animation on question change

---

## Supabase Integration

### Setup
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)
```

### Channel Subscription
```javascript
const channel = supabase.channel(`game:${roomCode}`, {
  config: {
    broadcast: { self: true }  // Receive own messages
  }
})

// Subscribe to broadcasts
channel
  .on('broadcast', { event: 'state_update' }, (payload) => {
    setGameState(payload.state)
  })
  .subscribe()
```

### Broadcasting State
```javascript
channel.send({
  type: 'broadcast',
  event: 'state_update',
  payload: { state: updatedGameState }
})
```

### Cleanup
```javascript
useEffect(() => {
  return () => {
    channel.unsubscribe()
  }
}, [])
```

---

## Development Guidelines

### State Management
- Use React hooks (`useState`, `useEffect`) for local state
- Synchronize state changes via Supabase broadcast
- Avoid prop drilling - use context if needed

### Real-Time Sync Rules
1. **Single Source of Truth:** Last broadcast wins (eventual consistency)
2. **Optimistic Updates:** Update local UI immediately, then broadcast
3. **Conflict Resolution:** Trust the most recent timestamp
4. **Disconnection Handling:** Show warning if Supabase connection drops

### Code Organization
```
src/
├── components/        # React components
├── hooks/
│   └── useGameState.js   # Custom hook for Supabase sync
├── data/
│   └── questions.js      # Question bank
├── utils/
│   ├── roomCode.js       # Generate random codes
│   └── shuffle.js        # Random player/question selection
└── App.jsx
```

---

## Testing Considerations

### Manual Testing Scenarios
1. **Multi-Device Sync**
   - Open app on 3+ devices
   - Join same room
   - Verify all see same state in real-time

2. **Network Issues**
   - Disconnect one device mid-game
   - Verify others continue playing
   - Reconnect device - should sync to current state

3. **Edge Cases**
   - Player leaves during their turn → skip to next
   - Host leaves → transfer host to next player
   - All players leave → room disappears

### Unit Testing
- Question randomization logic
- Room code generation (uniqueness)
- Level progression algorithm

---

## Deployment Checklist

### Vercel Setup
- [ ] Connect GitHub repository
- [ ] Add environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- [ ] Enable automatic deployments on push
- [ ] Set build command: `npm run build`
- [ ] Set output directory: `dist`

### Supabase Setup
- [ ] Create new project
- [ ] Enable Realtime in Settings → API
- [ ] Copy URL and anon key
- [ ] Configure CORS if needed (allow Vercel domain)
- [ ] No database tables needed

---

## Future Enhancements

### Phase 1 (MVP)
- [x] Basic room creation/joining
- [x] Real-time question display
- [x] Turn progression
- [x] Level transitions

### Phase 2
- [ ] Custom question packs (user-uploaded)
- [ ] Timer per question (optional)
- [ ] "Skip question" voting mechanism
- [ ] Sound effects & haptic feedback

### Phase 3
- [ ] Replay mode (review game questions)
- [ ] Share results to social media
- [ ] Analytics (most answered questions, avg time per level)
- [ ] Multi-language support

---

## Common Development Tasks

### Adding a New Question Level
1. Edit `src/data/questions.js`
2. Add new level key with array of questions
3. Update UI to handle new level number
4. Update color scheme in Tailwind config

### Changing Game Rules
Edit `src/config.js`:
```javascript
export const GAME_CONFIG = {
  defaultStartLevel: 5,        // Start level
  questionsPerLevel: 3,        // Questions before level decrease
  minPlayers: 2,               // Minimum to start
  maxPlayers: 10,              // Room capacity
  roomCodeLength: 4            // Room code chars
}
```

### Debugging Real-Time Issues
1. Open browser DevTools → Network → WS (WebSocket)
2. Monitor Supabase WebSocket messages
3. Check `supabase.channel()` subscription status
4. Verify broadcast payloads match expected schema

---

## Troubleshooting

### Issue: Players not syncing
**Solution:** Check Supabase Realtime is enabled in project settings

### Issue: Room code collisions
**Solution:** Increase `roomCodeLength` in config or add timestamp to code

### Issue: Player sees stale state
**Solution:** Ensure `broadcast: { self: true }` in channel config

### Issue: Game freezes on level transition
**Solution:** Verify question pool for next level isn't empty

---

## Performance Considerations

- **Broadcast Frequency:** Limit to ~1/second max (avoid spamming)
- **Question Pool Size:** 20-30 per level minimum (avoid repeats)
- **Player Limit:** 10 players max (UI real estate + network overhead)
- **Mobile Optimization:** Keep UI simple, avoid heavy animations

---

## Security Notes

- **No Authentication:** Users only provide first names (no PII)
- **Ephemeral Data:** Nothing persisted, rooms auto-delete
- **Supabase RLS:** Not needed (using Broadcast, not database)
- **Rate Limiting:** Rely on Supabase's built-in limits

---

This document should give you (Claude) full context on the project architecture, data flow, and development patterns. Reference this when making code changes or architectural decisions.

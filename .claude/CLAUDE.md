# Intimacy Ladder - Claude Project Context

## Project Overview

**Intimacy Ladder** is a real-time multiplayer party game where players answer progressively *less* vulnerable questions, starting from deep philosophical topics (Level 5) and working backwards to surface-level small talk (Level 1).

**Game Concept:** Flip traditional conversation progression by starting with the most intimate questions first, creating a unique social dynamic that facilitates rapid bonding among players.

---

## Architecture

### Stack Summary
- **Frontend:** React + Tailwind CSS
- **Real-time:** Supabase Postgres Realtime (WebSocket subscriptions)
- **Backend:** Supabase Edge Functions (Deno serverless)
- **Database:** PostgreSQL (3 tables: game_rooms, game_players, game_state)
- **Deployment:** Vercel (frontend) + Supabase (backend + database)

### Key Architectural Decisions

1. **Server-Authoritative Architecture**
   - All game logic runs in Edge Functions (serverless)
   - Database is the single source of truth
   - Edge Functions validate all state changes
   - Clients are read-only subscribers

2. **Database-Backed State**
   - Rooms persist in PostgreSQL database
   - Automatic cleanup after 2 hours or when empty
   - Room codes generated and validated server-side
   - Player presence tracked via heartbeat mechanism

3. **Postgres Realtime Sync**
   - Uses Supabase Postgres Realtime (CDC subscriptions)
   - Clients subscribe to database change events
   - Real-time updates via WebSocket (< 50ms latency)
   - Perfect state synchronization across all devices

---

## Information Flow Architecture

### 1. Room Creation
```
User Input (name + "Create Game")
  ↓
Frontend calls Edge Function: create-room
  {playerName, playerId, settings}
  ↓
Edge Function:
  - Generates unique 4-char room code
  - Inserts row in game_rooms table
  - Inserts creator in game_players table (is_host: true)
  - Returns {success, room, player}
  ↓
Postgres Realtime broadcasts INSERT events
  ↓
Frontend subscribes to room's Postgres channels
  ↓
All subscribed clients receive room and player data
```

### 2. Player Joining
```
User Input (name + room code)
  ↓
Frontend subscribes to Postgres channels for room
  (game_rooms, game_players, game_state)
  ↓
Frontend calls Edge Function: join-room
  {roomCode, playerName, playerId}
  ↓
Edge Function validates:
  - Room exists and not full
  - Player not already in room
  - Inserts player in game_players table
  - Returns {success, player}
  ↓
Postgres Realtime broadcasts INSERT to all subscribers
  ↓
All devices update player list in real-time
```

### 3. Game Start
```
Host clicks "Start Game"
  ↓
Frontend calls Edge Function: start-game
  {roomCode, playerId}
  ↓
Edge Function validates:
  - playerId matches room's host_id
  - Minimum players met (3+)
  - Updates game_rooms.status = 'playing'
  - Creates game_state row:
    - currentLevel: 5
    - currentPlayerIndex: random(0-N)
    - questionCount: 0
  - Returns {success, gameState}
  ↓
Postgres Realtime broadcasts INSERT (game_state) + UPDATE (game_rooms)
  ↓
All devices render game screen with highlighted current player
  ↓
Client sets first question (server doesn't have question bank)
```

### 4. Turn Progression
```
Current player clicks "Done Answering"
  ↓
Frontend calls Edge Function: next-turn
  {roomCode, playerId, currentQuestion}
  ↓
Edge Function validates:
  - playerId matches current player in game_state
  - Increments questionCount
  - Checks if level should decrease
  - Selects next random player (excluding current)
  - Adds currentQuestion to asked_questions array
  - Updates game_state table
  - Returns {success, gameState, gameFinished}
  ↓
Postgres Realtime broadcasts UPDATE event
  ↓
All devices:
  - Update highlighted player
  - Display new question (client selects from pool)
  - Animate level change if applicable
  ↓
Client updates question in database (server doesn't pick questions)
```

### 5. Level Transitions
```
After N questions at current level:
  ↓
Edge Function (next-turn) detects threshold
  (questionCount >= questionsPerLevel)
  ↓
Edge Function decrements level (5 → 4 → 3 → 2 → 1)
  ↓
Updates game_state with:
  - currentLevel: 4
  - questionCount: 0 (reset)
  - currentPlayerIndex: (next random player)
  ↓
Returns gameFinished: false (or true if level 1 complete)
  ↓
Postgres Realtime broadcasts UPDATE
  ↓
All devices show level transition animation
  ↓
Client selects new question from Level 4 pool
```

---

## Data Models

### Database Schema

**game_rooms table:**
```javascript
{
  id: UUID PRIMARY KEY,
  room_code: TEXT UNIQUE NOT NULL,     // e.g., "XK7D"
  host_id: TEXT NOT NULL,              // Creator's player ID
  status: TEXT NOT NULL,               // 'lobby' | 'playing' | 'finished'
  settings: JSONB NOT NULL,            // {startLevel: 5, questionsPerLevel: 3}
  created_at: TIMESTAMPTZ NOT NULL,
  updated_at: TIMESTAMPTZ NOT NULL
}
```

**game_players table:**
```javascript
{
  id: UUID PRIMARY KEY,
  room_code: TEXT NOT NULL,            // Foreign key to game_rooms
  player_id: TEXT NOT NULL,            // Client-generated UUID
  player_name: TEXT NOT NULL,          // User-provided name
  is_host: BOOLEAN NOT NULL,           // Host flag
  joined_at: TIMESTAMPTZ NOT NULL,
  last_heartbeat: TIMESTAMPTZ NOT NULL,
  UNIQUE(room_code, player_id)         // Prevent duplicates
}
```

**game_state table:**
```javascript
{
  id: UUID PRIMARY KEY,
  room_code: TEXT UNIQUE NOT NULL,     // Foreign key to game_rooms
  current_level: INTEGER NOT NULL,     // 1-5
  current_player_index: INTEGER NOT NULL,
  current_question: TEXT,              // Current question text
  question_count: INTEGER NOT NULL,    // Per-level counter
  asked_questions: JSONB NOT NULL,     // Array of asked questions
  updated_at: TIMESTAMPTZ NOT NULL
}
```

### Edge Functions API

**create-room:**
```javascript
POST /functions/v1/create-room
Body: { playerName: string, playerId: string, settings?: object }
Returns: { success: true, room: {...}, player: {...} }
Error: { error: string, details?: string }
```

**join-room:**
```javascript
POST /functions/v1/join-room
Body: { roomCode: string, playerName: string, playerId: string }
Returns: { success: true, player: {...} }
Error: { error: "Room not found" | "Room is full" | "Player already in room" }
```

**start-game:**
```javascript
POST /functions/v1/start-game
Body: { roomCode: string, playerId: string }
Returns: { success: true, gameState: {...} }
Error: { error: "Only host can start game" | "Need at least 3 players" }
```

**next-turn:**
```javascript
POST /functions/v1/next-turn
Body: { roomCode: string, playerId: string, currentQuestion: string }
Returns: { success: true, gameState: {...}, gameFinished: boolean }
Error: { error: "Not your turn" }
```

**player-heartbeat:**
```javascript
POST /functions/v1/player-heartbeat
Body: { roomCode: string, playerId: string }
Returns: { success: true }
// Called every 10 seconds by clients to maintain presence
```

### Client-Side State (Derived from Database)
```javascript
{
  roomCode: string,
  status: "lobby" | "playing" | "finished",
  hostId: string,
  players: Array<{id, name, isHost}>,
  settings: {startLevel: 1-5, questionsPerLevel: number},
  currentLevel: 1-5,
  currentPlayerIndex: number,
  currentQuestion: string,
  questionCount: number
}
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

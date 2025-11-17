# Intimacy Ladder - Claude Project Context

## Project Overview

**Intimacy Ladder** is a real-time multiplayer party game where players answer progressively *less* vulnerable questions, starting from deep philosophical topics (Level 5) and working backwards to surface-level small talk (Level 1).

**Game Concept:** Flip traditional conversation progression by starting with the most intimate questions first, creating a unique social dynamic that facilitates rapid bonding among players.

---

## Architecture

### Stack Summary
- **Frontend:** React + Tailwind CSS
- **Real-time:** Supabase Postgres Realtime (Change Data Capture via WebSocket)
- **Backend:** PostgreSQL triggers + RPC functions
- **Database:** PostgreSQL (3 tables: game_rooms, game_players, game_state)
- **Deployment:** Vercel (frontend) + Supabase (database + real-time)

### Key Architectural Decisions

1. **Database-Authoritative Architecture**
   - All game logic runs in PostgreSQL triggers and RPC functions
   - Database is the single source of truth
   - Database triggers validate all state changes
   - Clients are read-only subscribers via Postgres Realtime

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
Frontend calls RPC function: create_game_room
  {playerName, playerId, settings}
  ↓
RPC function (PostgreSQL):
  - Generates unique 4-char room code via generate_room_code()
  - Inserts row in game_rooms table
  - Inserts creator in game_players table (is_host: true)
  - Returns {success, room, player}
  ↓
Postgres Realtime broadcasts INSERT events (CDC)
  ↓
Frontend subscribes to room's Postgres channel
  ↓
All subscribed clients receive room and player data via WebSocket
```

### 2. Player Joining
```
User Input (name + room code)
  ↓
Frontend subscribes to Postgres channel for room
  (listens to game_rooms, game_players, game_state changes)
  ↓
Frontend directly inserts into game_players table
  {roomCode, playerName, playerId, isHost: false}
  ↓
Database trigger validates:
  - Room exists and not full
  - Player not already in room
  - Enforces constraints
  ↓
Postgres Realtime broadcasts INSERT to all subscribers (CDC)
  ↓
All devices update player list in real-time via WebSocket
```

### 3. Game Start
```
Host clicks "Start Game"
  ↓
Frontend updates game_rooms table directly
  UPDATE game_rooms SET status = 'playing'
  WHERE room_code = X AND host_id = playerId
  ↓
Database trigger: initialize_game_state_trigger
  - Validates minimum players met (3+)
  - Creates game_state row:
    - currentLevel: 5
    - currentPlayerIndex: random(0-N)
    - questionCount: 0
  - Auto-committed with room status update
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
Frontend calls RPC function: advance_turn
  {roomCode, playerId, currentQuestion}
  ↓
RPC function validates & updates:
  - playerId matches current player in game_state
  - Increments questionCount
  - Checks if level should decrease (via process_next_turn trigger)
  - Selects next random player (excluding current)
  - Adds currentQuestion to asked_questions array
  - Updates game_state table
  - Returns {success, gameState}
  ↓
Postgres Realtime broadcasts UPDATE event (CDC)
  ↓
All devices receive update via WebSocket:
  - Update highlighted player
  - Animate level change if applicable
  ↓
Current player's client sets next question from client-side pool
  (database doesn't have question bank)
```

### 5. Level Transitions
```
After N questions at current level:
  ↓
Database trigger: process_next_turn detects threshold
  (questionCount >= questionsPerLevel)
  ↓
Trigger decrements level (5 → 4 → 3 → 2 → 1)
  ↓
Updates game_state with:
  - currentLevel: 4
  - questionCount: 0 (reset)
  - currentPlayerIndex: (next random player)
  ↓
If level 1 complete, trigger updates game_rooms.status = 'finished'
  ↓
Postgres Realtime broadcasts UPDATE (CDC)
  ↓
All devices receive update via WebSocket:
  - Show level transition animation
  - Update game status if finished
  ↓
Current player's client selects new question from Level 4 pool
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

### Database RPC Functions

**create_game_room:**
```sql
SELECT * FROM create_game_room(
  player_name TEXT,
  player_id TEXT,
  game_settings JSONB
)
Returns: { success: boolean, room: {...}, player: {...}, error?: string }
```
- Generates unique room code via `generate_room_code()`
- Creates room in game_rooms table
- Adds creator as host in game_players table
- Returns room and player data

**advance_turn:**
```sql
SELECT * FROM advance_turn(
  room_code_param TEXT,
  player_id_param TEXT,
  current_question_param TEXT
)
Returns: { success: boolean, gameState: {...}, error?: string }
```
- Validates current player
- Increments question count
- Adds question to asked_questions array
- Selects next random player
- Triggers `process_next_turn` for level transitions
- Returns updated game state

### Database Triggers

**initialize_game_state_trigger:**
- Fires when game_rooms.status changes to 'playing'
- Creates game_state record with initial values
- Sets random starting player

**process_next_turn:**
- Fires after advance_turn updates game_state
- Checks if level should decrease
- Handles level transitions (5 → 4 → 3 → 2 → 1)
- Sets game_rooms.status = 'finished' when complete

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
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

### Postgres Realtime Channel Subscription (CDC)
```javascript
// Single channel for all table subscriptions
const channel = supabase
  .channel(`room:${roomCode}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'game_rooms',
    filter: `room_code=eq.${roomCode}`
  }, (payload) => {
    // Handle room updates (status changes, etc.)
    setGameState(prev => ({ ...prev, ...payload.new }))
  })
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'game_players',
    filter: `room_code=eq.${roomCode}`
  }, async (payload) => {
    // Refetch players when changes occur
    const { data: players } = await supabase
      .from('game_players')
      .select('*')
      .eq('room_code', roomCode)
    setGameState(prev => ({ ...prev, players }))
  })
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'game_state',
    filter: `room_code=eq.${roomCode}`
  }, (payload) => {
    // Handle game state updates (turn changes, level transitions)
    setGameState(prev => ({ ...prev, ...payload.new }))
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('Connected to Realtime')
    }
  })
```

### Direct Database Operations
```javascript
// Call RPC function
const { data, error } = await supabase.rpc('create_game_room', {
  player_name: 'Alice',
  player_id: crypto.randomUUID(),
  game_settings: { startLevel: 5, questionsPerLevel: 3 }
})

// Direct table insert (with trigger validation)
await supabase
  .from('game_players')
  .insert({
    room_code: 'ABCD',
    player_id: playerId,
    player_name: 'Bob',
    is_host: false
  })

// Heartbeat update
await supabase
  .from('game_players')
  .update({ last_heartbeat: new Date().toISOString() })
  .eq('room_code', roomCode)
  .eq('player_id', playerId)
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
- Database is the single source of truth
- Subscribe to Postgres Realtime (CDC) for automatic updates
- Avoid prop drilling - use custom hooks like `useGameState`

### Real-Time Sync Rules
1. **Single Source of Truth:** Database always wins (via CDC)
2. **No Optimistic Updates:** Database triggers handle all validation
3. **Automatic Sync:** Postgres Realtime broadcasts changes via WebSocket
4. **Disconnection Handling:** Show warning if Realtime connection drops
5. **Question Assignment:** Only current player sets questions (prevents race conditions)

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

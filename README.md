# 🔥 Surface Level

A multiplayer party game that flips social conventions by starting with the deepest questions first and working backwards to small talk.

## 🎮 What Is This?

Surface Level is a real-time party game where 2-10 players join a room on their phones and take turns answering increasingly *less* vulnerable questions. Start by discussing your core identity and life purpose (Level 5), then gradually work back to safe small talk about hobbies and weather (Level 1).

Think: **Codenames meets Truth or Dare meets philosophical speed-dating.**

---

## ✨ Key Features

- 🎲 **Reverse Vulnerability** - Start deep, end shallow (the opposite of normal conversation)
- 📱 **Phone-Based** - Everyone joins on their own device using a room code
- ⚡ **Real-time Sync** - All devices stay perfectly in sync via Postgres Realtime
- 🔄 **Auto-Cleanup** - Rooms automatically deleted when inactive (2 hours) or empty
- 🎯 **Simple UX** - One-tap to answer, automatic turn progression
- 🌐 **No Login Required** - Just enter a name and jump in
- 🔁 **Question Reroll** - Answerer can reroll a question once per level
- 🔗 **Reconnection Support** - Session management allows players to rejoin if disconnected
- 📊 **Dynamic Questions** - Questions per level automatically matches player count

---

## 🏗️ Tech Stack

### Frontend
- **React** - UI components and state management
- **Tailwind CSS** - Utility-first styling
- **Supabase JS Client** - Real-time WebSocket connection
- **Vercel** - Deployment platform

### Backend
- **PostgreSQL** - Database-authoritative game logic
- **Supabase Postgres Realtime** - Change Data Capture (CDC) for real-time sync
- **PostgreSQL Triggers** - Server-side game logic and validation
- **RPC Functions** - API layer for client operations
- **pg_cron** - Scheduled cleanup jobs

---

## 🎯 How It Works

### Game Flow

```
1. HOST CREATES GAME
   → Generates room code (e.g., "XK7D")
   → Sets starting level (default: 5)
   → Questions per level automatically matches player count

2. PLAYERS JOIN
   → Enter name + room code
   → See lobby with all connected players
   → Session token saved for reconnection support

3. GAME STARTS (Level 5)
   → Random circular order generated (e.g., P1→P2→P3→P1)
   → First player (asker) selects/writes a question for second player (answerer)
   → Answerer responds aloud
   → Click "Done" to advance to next in circle

4. TURN PROGRESSION
   → Asker sees 3-5 question options + custom input field
   → Selects or writes question → Asks answerer
   → Answerer answers aloud → Clicks "I'm Done Answering"
   → Answerer can reroll question once per level
   → Answerer becomes next asker in circular pattern (P1→P2→P3→P1→P2...)

5. LEVEL PROGRESSION
   → After N questions (where N = player count), level decreases (5 → 4 → 3 → 2 → 1)
   → Questions get progressively less vulnerable
   → NEW random circular order generated for each level

6. GAME ENDS
   → Reaches Level 1 questions
   → Players can restart or leave
```

### The 5 Levels

| Level | Category | Example Question |
|-------|----------|------------------|
| **5** | Core Identity | "What would you sacrifice everything for?" |
| **4** | Emotions & Vulnerabilities | "When did you last cry alone?" |
| **3** | Beliefs & Values | "What's a belief you've completely reversed?" |
| **2** | Experiences & Opinions | "What's your most unpopular opinion?" |
| **1** | Biographical | "What's your job?" |

---

## 🔄 Information Flow

### Room Creation & Joining
```
User A (Host)
  ↓ Calls create_game_room RPC function
  ↓ PostgreSQL generates unique room code "XK7D"
  ↓ Inserts into game_rooms and game_players tables
  ↓ Client subscribes to Postgres CDC for room "XK7D"

Users B, C, D
  ↓ Enter code "XK7D" + names
  ↓ Insert into game_players table
  ↓ Database trigger validates (room exists, not full, etc.)
  ↓ Subscribe to same Postgres CDC channel

Postgres Realtime (CDC)
  ↓ Broadcasts INSERT events to all subscribers

All Devices
  ↓ Update lobby UI in real-time via WebSocket
```

### Turn Progression
```
Asker Player
  ↓ Sees QuestionSelector UI with 3-5 options + custom input
  ↓ Selects or writes question
  ↓ Clicks "Ask Question"

Frontend
  ↓ Calls set_question RPC function
  ↓ Passes: room code, player ID, question text, is_custom flag

PostgreSQL
  ↓ Validates requester is current asker
  ↓ Updates current_question and is_custom_question in game_state

Postgres Realtime (CDC)
  ↓ Broadcasts UPDATE event to all subscribers (< 50ms)

All Devices
  ↓ Display question to answerer (+ "I'm Done Answering" button)
  ↓ Other players see question (read-only)

Answerer Player
  ↓ Answers question aloud
  ↓ Clicks "I'm Done Answering"

Frontend
  ↓ Calls advance_turn RPC function
  ↓ Passes: room code, player ID, current question

PostgreSQL
  ↓ Validates requester is current answerer
  ↓ Increments question_count
  ↓ Adds question to asked_questions array
  ↓ Advances circular order (answerer → next asker)
  ↓ Clears current_question to NULL
  ↓ Trigger: process_next_turn checks if level should decrease
  ↓ Updates game_state table

Postgres Realtime (CDC)
  ↓ Broadcasts UPDATE event to all subscribers (< 50ms)

All Devices
  ↓ Update asker/answerer indicators
  ↓ New asker sees QuestionSelector UI
```

---

## 📊 Data Flow Diagram

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Player 1   │         │  Player 2   │         │  Player 3   │
│  (Host)     │         │             │         │             │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │ Insert/Update         │ Subscribe to          │ Subscribe to
       │ Database Tables       │ Postgres CDC          │ Postgres CDC
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   POSTGRESQL DB      │
                    │  ┌────────────────┐  │
                    │  │ game_rooms     │  │
                    │  │ game_players   │  │
                    │  │ game_state     │  │
                    │  └────────────────┘  │
                    │  Triggers validate   │
                    │  and process logic   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  POSTGRES REALTIME   │
                    │  (Change Data        │
                    │   Capture - CDC)     │
                    │                      │
                    │  Broadcasts changes  │
                    │  via WebSocket       │
                    └──────────┬───────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Updates UI │         │  Updates UI │         │  Updates UI │
│  - Current  │         │  - Current  │         │  - Current  │
│    player   │         │    player   │         │    player   │
│  - Question │         │  - Question │         │  - Question │
│  - Level    │         │  - Level    │         │  - Level    │
└─────────────┘         └─────────────┘         └─────────────┘
```

**Key Insight:** PostgreSQL is the single source of truth. Database triggers handle all game logic server-side. Postgres Realtime (CDC) broadcasts table changes to all subscribed clients via WebSocket.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Supabase account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/Novapool/LOI.git
cd LOI

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your Supabase URL and anon key to .env.local

# Run development server
npm run dev
```

### Environment Variables

Create `.env.local`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 🎨 Project Structure

```
surface-level/
├── src/
│   ├── components/
│   │   ├── CampfireAnimation.jsx # Animated campfire decoration
│   │   ├── GameScreen.jsx        # Active game UI (asker/answerer logic)
│   │   ├── Lobby.jsx             # Room creation & player joining
│   │   ├── LobbyPlayerCard.jsx   # Player card in lobby view
│   │   ├── PlayerBadge.jsx       # Player indicator badge
│   │   ├── QuestionCard.jsx      # Question display component
│   │   ├── QuestionSelector.jsx  # Question picker UI with reroll
│   │   └── ReconnectPrompt.jsx   # Session reconnection UI
│   ├── hooks/
│   │   └── useGameState.js       # Supabase real-time logic
│   ├── data/
│   │   └── questions.js          # Question bank (5 levels) + selection utils
│   ├── utils/
│   │   ├── roomCode.js           # Room code utilities
│   │   ├── sessionManager.js     # Session persistence for reconnection
│   │   └── shuffle.js            # Array shuffling utilities
│   ├── config.js                 # Game configuration constants
│   └── App.jsx
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql
│       ├── 002_game_logic.sql
│       ├── 003_api.sql
│       ├── 004_realtime_and_security.sql
│       ├── 005_scheduled_jobs.sql
│       ├── 006_fix_level_transitions.sql
│       ├── 007_question_selection_flow.sql
│       ├── 008_protect_active_games.sql
│       ├── 009_dynamic_questions_per_level.sql
│       ├── 010_add_question_reroll.sql
│       └── 011_reconnect_functionality.sql
├── public/
└── package.json
```

---

## 🎲 Game Design Philosophy

### Why Reverse Order?

Traditional icebreakers follow this progression:
```
Safe Small Talk → Shared Interests → Deeper Topics → Vulnerability
```

This takes hours and often never reaches real depth.

Surface Level inverts it:
```
Core Identity → Vulnerabilities → Values → Opinions → Small Talk
```

**Benefits:**
1. **Efficiency** - Get to meaningful conversation in 5 minutes
2. **Safety** - Questions get *easier* as you go (built-in recovery)
3. **Surprise** - Novelty keeps players engaged
4. **Memory** - People remember the first questions most

---

## 🛠️ Development

### Adding Questions

Edit `src/data/questions.js`:
```javascript
export const questions = {
  5: [
    "What would you sacrifice everything for?",
    "What keeps you awake at 3am?",
    // Add more level 5 questions
  ],
  4: [...],
  // etc.
}
```

### Customizing Levels

Modify `src/config.js`:
```javascript
export const GAME_CONFIG = {
  QUESTIONS_PER_LEVEL: 3,   // Default, but overridden by player count
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  HEARTBEAT_INTERVAL: 30000,
  // ...
}
```

---

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy (automatic on push)

### Supabase Setup

1. Create a new Supabase project
2. Run migrations in `supabase/migrations/` folder (001-011) to create:
   - Database tables (game_rooms, game_players, game_state, game_events)
   - Triggers for game logic and validation
   - RPC functions (create_game_room, set_question, advance_turn, reroll_question, reconnect_player)
   - Helper functions (shuffle_player_ids for circular order)
   - Scheduled cleanup jobs (pg_cron)
   - Session management for reconnection
3. Enable Realtime for tables in Settings → Database → Replication
4. Copy URL + anon key to `.env.local`

**Key Migrations:**
- **007**: Question selection and circular turn order
- **008**: Protect active games from cleanup
- **009**: Dynamic questions per level (matches player count)
- **010**: Question reroll feature
- **011**: Reconnection support with session tokens

---

## 🤝 Contributing

Contributions welcome! Ideas:
- 🌍 Multi-language support
- 🎨 Custom question packs
- 📊 Post-game analytics
- 🎵 Sound effects & animations
- ♿ Accessibility improvements

---

## 📄 License

MIT License - feel free to fork and modify!

---

## 🙏 Acknowledgments

Inspired by:
- The 36 Questions That Lead to Love (Arthur Aron)
- Jackbox Party Packs
- We're Not Really Strangers

---

## 📞 Support

Issues? Questions? Open a GitHub issue or reach out!

**Built with ❤️ for deeper conversations**

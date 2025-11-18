# 🎭 Intimacy Ladder

A multiplayer party game that flips social conventions by starting with the deepest questions first and working backwards to small talk.

## 🎮 What Is This?

Intimacy Ladder is a real-time party game where 3-10 players join a room on their phones and take turns answering increasingly *less* vulnerable questions. Start by discussing your core identity and life purpose (Level 5), then gradually work back to safe small talk about hobbies and weather (Level 1).

Think: **Codenames meets Truth or Dare meets philosophical speed-dating.**

---

## ✨ Key Features

- 🎲 **Reverse Vulnerability** - Start deep, end shallow (the opposite of normal conversation)
- 📱 **Phone-Based** - Everyone joins on their own device using a room code
- ⚡ **Real-time Sync** - All devices stay perfectly in sync via Postgres Realtime
- 🔄 **Auto-Cleanup** - Rooms automatically deleted when inactive (2 hours) or empty
- 🎯 **Simple UX** - One-tap to answer, automatic turn progression
- 🌐 **No Login Required** - Just enter a name and jump in

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
   → Sets starting level (1-5) and questions per level

2. PLAYERS JOIN
   → Enter name + room code
   → See lobby with all connected players

3. GAME STARTS (Level 5)
   → Random player gets a deep question
   → They answer aloud
   → Click "Done" to pass turn to next random player

4. LEVEL PROGRESSION
   → After N questions, level decreases (5 → 4 → 3 → 2 → 1)
   → Questions get progressively less vulnerable

5. GAME ENDS
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
Current Player
  ↓ Answers question aloud
  ↓ Clicks "I'm Done Answering"

Frontend
  ↓ Calls advance_turn RPC function
  ↓ Passes: room code, player ID, current question

PostgreSQL
  ↓ Validates requester is current player
  ↓ Increments question_count
  ↓ Adds question to asked_questions array
  ↓ Trigger: process_next_turn checks if level should decrease
  ↓ Selects next random player (excluding current)
  ↓ Updates game_state table

Postgres Realtime (CDC)
  ↓ Broadcasts UPDATE event to all subscribers (< 50ms)

All Devices
  ↓ Update highlighted player
  ↓ Current player sets next question from pool
  ↓ Updates current_question in database
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
git clone https://github.com/yourusername/intimacy-ladder.git
cd intimacy-ladder

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
intimacy-ladder/
├── src/
│   ├── components/
│   │   ├── Lobby.jsx          # Room creation & player joining
│   │   ├── GameScreen.jsx     # Active game UI
│   │   └── QuestionCard.jsx   # Question display component
│   ├── hooks/
│   │   └── useGameState.js    # Supabase real-time logic
│   ├── data/
│   │   └── questions.js       # Question bank (5 levels)
│   └── App.jsx
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

Intimacy Ladder inverts it:
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
  defaultStartLevel: 5,
  questionsPerLevel: 3,
  minPlayers: 2,
  maxPlayers: 10,
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
2. Run migrations in `supabase/migrations/` folder (001-005) to create:
   - Database tables (game_rooms, game_players, game_state, game_events)
   - Triggers for game logic and validation
   - RPC functions (create_game_room, advance_turn)
   - Scheduled cleanup jobs (pg_cron)
3. Enable Realtime for tables in Settings → Database → Replication
4. Copy URL + anon key to `.env.local`

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

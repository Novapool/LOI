# Supabase Edge Functions

Server-side logic for the Intimacy Ladder multiplayer game system.

## Overview

These Edge Functions provide server-authoritative game logic, replacing the client-side Broadcast channel approach with database-backed Postgres Realtime.

## Functions

### `create-room`
Creates a new game room and adds the creator as host.

**Endpoint:** `POST /create-room`

**Request:**
```json
{
  "playerName": "Laith",
  "playerId": "player-123-abc",
  "settings": {
    "startLevel": 5,
    "questionsPerLevel": 3
  }
}
```

**Response:**
```json
{
  "success": true,
  "room": {
    "roomCode": "XK7D",
    "hostId": "player-123-abc",
    "status": "lobby",
    "settings": { "startLevel": 5, "questionsPerLevel": 3 },
    "createdAt": "2025-11-17T10:00:00Z"
  },
  "player": {
    "playerId": "player-123-abc",
    "playerName": "Laith",
    "isHost": true
  }
}
```

---

### `join-room`
Allows a player to join an existing game room.

**Endpoint:** `POST /join-room`

**Request:**
```json
{
  "roomCode": "XK7D",
  "playerName": "Sarah",
  "playerId": "player-456-def"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully joined room",
  "room": {
    "roomCode": "XK7D",
    "hostId": "player-123-abc",
    "status": "lobby",
    "settings": { "startLevel": 5, "questionsPerLevel": 3 }
  },
  "player": {
    "playerId": "player-456-def",
    "playerName": "Sarah",
    "isHost": false
  }
}
```

**Validations:**
- Room must exist
- Room must be in 'lobby' status (not started)
- Room must not be full (max 10 players)
- Player ID must be unique in room

---

### `start-game`
Starts the game (host only) and initializes game state.

**Endpoint:** `POST /start-game`

**Request:**
```json
{
  "roomCode": "XK7D",
  "playerId": "player-123-abc"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Game started successfully",
  "gameState": {
    "roomCode": "XK7D",
    "currentLevel": 5,
    "currentPlayerIndex": 2,
    "currentQuestion": null,
    "questionCount": 0
  },
  "players": [
    {
      "playerId": "player-123-abc",
      "playerName": "Laith",
      "isHost": true,
      "isCurrentPlayer": false
    },
    {
      "playerId": "player-456-def",
      "playerName": "Sarah",
      "isHost": false,
      "isCurrentPlayer": false
    },
    {
      "playerId": "player-789-ghi",
      "playerName": "John",
      "isHost": false,
      "isCurrentPlayer": true
    }
  ]
}
```

**Validations:**
- Only host can start game
- Minimum 3 players required
- Room must be in 'lobby' status

---

### `next-turn`
Advances the game to the next turn, handles level transitions.

**Endpoint:** `POST /next-turn`

**Request:**
```json
{
  "roomCode": "XK7D",
  "playerId": "player-789-ghi",
  "currentQuestion": "What would you die for?"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Turn advanced successfully",
  "gameState": {
    "roomCode": "XK7D",
    "currentLevel": 5,
    "currentPlayerIndex": 0,
    "currentQuestion": null,
    "questionCount": 1
  },
  "nextPlayer": {
    "playerId": "player-123-abc",
    "playerName": "Laith"
  },
  "levelChanged": false
}
```

**Game Over Response:**
```json
{
  "success": true,
  "message": "Game finished!",
  "gameFinished": true,
  "finalLevel": 1
}
```

**Logic:**
- Only current player can advance turn
- Increments question count
- Decreases level after N questions (from settings)
- Selects random next player (not current)
- Finishes game when level 1 completed

---

### `player-heartbeat`
Updates player's heartbeat to indicate they're still connected.

**Endpoint:** `POST /player-heartbeat`

**Request:**
```json
{
  "roomCode": "XK7D",
  "playerId": "player-123-abc"
}
```

**Response:**
```json
{
  "success": true,
  "playerCount": 3,
  "isAlive": true
}
```

**Automatic Cleanup:**
- Removes players with no heartbeat for 30+ seconds
- Transfers host if disconnected host is removed
- Deletes room if all players disconnect

---

## Deployment

### Deploy All Functions

```bash
# From project root
supabase functions deploy create-room
supabase functions deploy join-room
supabase functions deploy start-game
supabase functions deploy next-turn
supabase functions deploy player-heartbeat
```

### Deploy Single Function

```bash
supabase functions deploy create-room
```

### View Function Logs

```bash
supabase functions logs create-room
```

### Test Locally

```bash
supabase functions serve create-room

# In another terminal
curl -X POST http://localhost:54321/functions/v1/create-room \
  -H "Content-Type: application/json" \
  -d '{"playerName":"Laith","playerId":"player-123"}'
```

---

## Environment Variables

Edge Functions automatically have access to:
- `SUPABASE_URL`: Your project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (bypasses RLS)

These are set automatically by Supabase.

---

## Error Handling

All functions return errors in this format:

```json
{
  "error": "Human-readable error message",
  "details": "Technical details (optional)"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad request (validation error)
- `403`: Forbidden (not host, wrong player, etc.)
- `404`: Not found (room/player doesn't exist)
- `500`: Internal server error

---

## Security Notes

1. **Service Role Key**: Edge Functions use the service role key, which bypasses Row Level Security (RLS). This is intentional - validation happens in the function code.

2. **Input Validation**: All functions validate inputs before database operations.

3. **CORS**: All functions allow CORS from any origin (`*`). For production, consider restricting to your domain.

4. **Rate Limiting**: Supabase provides built-in rate limiting on Edge Functions.

---

## Integration with React

See the updated `useGameState.ts` hook for examples of calling these Edge Functions from your React app.

Example:
```typescript
const response = await fetch(
  `${supabaseUrl}/functions/v1/create-room`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify({
      playerName: name,
      playerId: playerId
    })
  }
)

const data = await response.json()
```

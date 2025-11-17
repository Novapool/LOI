# Supabase Database Setup

This directory contains SQL migrations and Edge Functions for the Intimacy Ladder multiplayer system.

## Prerequisites

1. A Supabase project (free tier works!)
2. Supabase CLI installed: `npm install -g supabase`
3. Your Supabase project URL and keys

## Step 1: Link Your Supabase Project

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF
```

You can find your project ref in your Supabase dashboard URL: `https://app.supabase.com/project/YOUR_PROJECT_REF`

## Step 2: Apply Database Migrations

You have two options:

### Option A: Using Supabase Dashboard (Easiest)

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Create a new query
4. Copy and paste the contents of `migrations/001_create_game_tables.sql`
5. Click "Run"
6. Repeat for `migrations/002_create_rls_policies.sql`

### Option B: Using Supabase CLI

```bash
# From the project root directory
cd supabase

# Apply migrations in order
supabase db push
```

## Step 3: Verify Migrations

1. Go to "Table Editor" in Supabase dashboard
2. You should see three new tables:
   - `game_rooms`
   - `game_players`
   - `game_state`

3. Go to "Database" → "Publications" → "supabase_realtime"
4. Verify that all three tables are enabled for Realtime

## Step 4: Deploy Edge Functions

```bash
# Deploy all Edge Functions
supabase functions deploy create-room
supabase functions deploy join-room
supabase functions deploy start-game
supabase functions deploy next-turn
supabase functions deploy player-heartbeat
```

## Step 5: Set Environment Variables

Update your `.env.local` file:

```env
# Your existing variables
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# No changes needed - we're still using the same Supabase project!
```

## Database Schema

### `game_rooms`
Stores room/lobby information
- `id`: UUID primary key
- `room_code`: Unique 4-character code (e.g., "XK7D")
- `host_id`: Player ID of the host
- `status`: 'lobby' | 'playing' | 'finished'
- `settings`: JSONB with game settings
- `created_at`, `updated_at`: Timestamps

### `game_players`
Stores players in each room
- `id`: UUID primary key
- `room_code`: References game_rooms
- `player_id`: Unique player identifier
- `player_name`: Display name
- `is_host`: Boolean flag
- `joined_at`: When player joined
- `last_heartbeat`: For presence detection

### `game_state`
Stores current game state
- `id`: UUID primary key
- `room_code`: References game_rooms (unique)
- `current_level`: 1-5
- `current_player_index`: Index in players array
- `current_question`: Current question text
- `question_count`: Questions answered at this level
- `asked_questions`: Array of asked question IDs
- `updated_at`: Last update timestamp

## Cleanup & Maintenance

The database includes automatic cleanup functions:

- **Inactive players**: Removed after 30 seconds of no heartbeat
- **Old rooms**: Removed after 2 hours

To manually trigger cleanup:

```sql
-- In Supabase SQL Editor
SELECT cleanup_inactive_players();
SELECT cleanup_old_rooms();
```

## Troubleshooting

### Tables not visible in Realtime

1. Go to Database → Replication
2. Ensure "supabase_realtime" publication exists
3. Check that your tables are in the publication

### RLS blocking queries

- Edge Functions use the service role key, so they bypass RLS
- Client queries use the anon key and are subject to RLS
- Check policies if client queries fail

### Migration errors

If migrations fail:
1. Check for existing tables with the same names
2. Drop existing tables if this is a fresh start
3. Re-run migrations

## Next Steps

After setting up the database:
1. Deploy Edge Functions (see `/supabase/functions/README.md`)
2. Update React hooks to use Postgres Realtime
3. Test with multiple devices!

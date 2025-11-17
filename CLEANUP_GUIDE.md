# Cleanup System Guide

## Problem Summary

Your cleanup functions existed but weren't running automatically. Here's why:

### Before the Fix

1. **Heartbeat-triggered cleanup**: Only ran when a player sent a heartbeat update
2. **Issue**: When all players close their browsers, no heartbeats = no cleanup
3. **Result**: Dead rooms and inactive players persist indefinitely

### After the Fix

- **Scheduled cleanup jobs** run automatically every 30 seconds (players) and 5 minutes (rooms)
- Works even when no one is connected

---

## How to Apply the Fix

### Option 1: Using Supabase CLI (Recommended)

```bash
# Make sure you're in the project directory
cd /home/user/LOI

# Apply the new migration
supabase db push

# Or if migrations aren't synced:
supabase migration up
```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/004_setup_automatic_cleanup.sql`
4. Paste and run the SQL

### Option 3: Manual SQL Execution

```sql
-- Run this in Supabase SQL Editor or via psql
\i supabase/migrations/004_setup_automatic_cleanup.sql
```

---

## What Was Added

### 1. pg_cron Extension
Enables scheduled jobs in PostgreSQL (like Linux cron).

### 2. Two Scheduled Jobs

**Job 1: cleanup-inactive-players**
- **Schedule**: Every 30 seconds
- **Action**: Deletes players with no heartbeat for 30+ seconds
- **Why 30s**: Players send heartbeat every 10s, so 30s = 3 missed heartbeats

**Job 2: cleanup-old-rooms**
- **Schedule**: Every 5 minutes
- **Action**: Deletes rooms older than 2 hours OR rooms with 0 players
- **Why 5min**: Rooms don't change often, so frequent checks aren't needed

### 3. Enhanced cleanup_old_rooms()
Now also deletes **empty rooms** (rooms with 0 players), even if they're recent.

### 4. preview_cleanup() Function (Debugging)
Preview what will be cleaned up without actually deleting:

```sql
SELECT * FROM preview_cleanup();
```

Returns:
```
cleanup_type      | room_code | details
------------------|-----------|----------------------------------
inactive_player   | ABCD      | {"playerName": "Alice", ...}
old_room          | XYZ9      | {"createdAt": "2025-01-15", ...}
empty_room        | TEST      | {"playerCount": 0, ...}
```

---

## Verify It's Working

### Check Scheduled Jobs

```sql
-- List all cron jobs
SELECT * FROM cron.job;
```

You should see:
- `cleanup-inactive-players` (every 30 seconds)
- `cleanup-old-rooms` (every 5 minutes)

### Check Job History

```sql
-- See recent job runs
SELECT
  job_name,
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

### Manual Test

```sql
-- Manually trigger cleanup (for testing)
SELECT cleanup_inactive_players();
SELECT cleanup_old_rooms();

-- Check what would be cleaned
SELECT * FROM preview_cleanup();
```

---

## Troubleshooting

### Issue: "extension pg_cron not found"

**Cause**: pg_cron is not available on all Supabase plans (requires Pro plan or self-hosted).

**Solution A: Use Supabase Edge Function** (Works on all plans)

Create a scheduled Edge Function using Supabase Cron:

```typescript
// supabase/functions/cleanup-scheduler/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Run cleanup functions
  await supabase.rpc('cleanup_inactive_players')
  await supabase.rpc('cleanup_old_rooms')

  return new Response('Cleanup completed', { status: 200 })
})
```

Then schedule it in Supabase Dashboard:
- Go to **Edge Functions** → **Cron Jobs**
- Add schedule: `*/30 * * * * *` (every 30 seconds)

**Solution B: Use an external cron service** (e.g., cron-job.org, GitHub Actions)

Example GitHub Actions workflow:

```yaml
# .github/workflows/cleanup.yml
name: Database Cleanup
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger cleanup
        run: |
          curl -X POST \
            '${{ secrets.SUPABASE_URL }}/rest/v1/rpc/cleanup_inactive_players' \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"

          curl -X POST \
            '${{ secrets.SUPABASE_URL }}/rest/v1/rpc/cleanup_old_rooms' \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

### Issue: Jobs are scheduled but not running

```sql
-- Check if cron is enabled
SHOW cron.database_name;

-- Enable cron logging
ALTER SYSTEM SET cron.log_run = on;

-- Reload configuration
SELECT pg_reload_conf();
```

### Issue: Want to change cleanup intervals

```sql
-- Unschedule old job
SELECT cron.unschedule('cleanup-inactive-players');

-- Schedule with new interval (e.g., every 60 seconds)
SELECT cron.schedule(
  'cleanup-inactive-players',
  '*/60 * * * * *',
  $$ SELECT cleanup_inactive_players() $$
);
```

---

## Configuration Options

### Adjust Inactive Player Threshold

Edit `cleanup_inactive_players()` in migration 001:

```sql
-- Change 30 seconds to 60 seconds
DELETE FROM game_players
WHERE last_heartbeat < NOW() - INTERVAL '60 seconds';
```

### Adjust Old Room Threshold

Edit `cleanup_old_rooms()` in migration 004:

```sql
-- Change 2 hours to 4 hours
WHERE created_at < NOW() - INTERVAL '4 hours'
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ CLEANUP SYSTEM (3 Triggers)                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 1. HEARTBEAT-BASED (Real-time)                          │
│    Trigger: cleanup_inactive_players_trigger            │
│    When: Player updates heartbeat                       │
│    Action: Remove OTHER inactive players in same room   │
│                                                          │
│ 2. SCHEDULED - INACTIVE PLAYERS (Every 30s)             │
│    Job: cleanup-inactive-players                        │
│    Action: Remove ALL players (no heartbeat 30s+)       │
│    Handles: Players who closed browser                  │
│                                                          │
│ 3. SCHEDULED - OLD/EMPTY ROOMS (Every 5min)             │
│    Job: cleanup-old-rooms                               │
│    Action: Remove rooms >2hrs OR with 0 players         │
│    Handles: Abandoned rooms, empty lobbies              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Apply the migration** (see "How to Apply the Fix" above)
2. **Verify jobs are scheduled**: `SELECT * FROM cron.job;`
3. **Test cleanup**: Close browser, wait 30s, check database
4. **Monitor job history**: `SELECT * FROM cron.job_run_details;`

---

## FAQ

**Q: Why not just use the heartbeat trigger for everything?**
A: The trigger only fires when a heartbeat is UPDATED. If all players close their browsers, there are no updates, so the trigger never fires.

**Q: Why clean up every 30 seconds? Isn't that too frequent?**
A: Players send heartbeats every 10 seconds. After 30 seconds (3 missed heartbeats), we can be confident the player is gone. This ensures quick cleanup without false positives.

**Q: Will this affect performance?**
A: No. The queries use indexes (`idx_game_players_last_heartbeat`, `idx_game_rooms_created_at`) and only run on small datasets (inactive players/old rooms).

**Q: Can I disable scheduled cleanup and rely only on triggers?**
A: Not recommended. Triggers only fire on specific events. Scheduled jobs ensure cleanup happens even when no one is connected.

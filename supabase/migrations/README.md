# Database Migrations

This directory contains all database migrations for the Intimacy Ladder game. Migrations are organized by concern for easier maintenance.

## Migration Order

Migrations run in numerical order. **DO NOT** change the numbering without understanding the dependencies.

```
001_schema.sql                  ← Tables, indexes, basic utilities
002_game_logic.sql              ← Validation, game logic, triggers
003_api.sql                     ← RPC functions, permissions
004_realtime_and_security.sql   ← Realtime setup, RLS policies
005_scheduled_jobs.sql          ← pg_cron jobs
```

## Quick Reference

### 001_schema.sql
**Creates:** Tables, indexes, utility functions
- `game_rooms` table
- `game_players` table
- `game_state` table
- `game_events` table (event log)
- Performance indexes
- `update_updated_at_column()` function

**Edit when:** Adding new tables, columns, or indexes

---

### 002_game_logic.sql
**Creates:** Business logic, validation, triggers
- `generate_room_code()` - Generate unique room codes
- Validation functions (player join, game start, turn advancement)
- Game logic (initialize game, process turns)
- Cleanup functions (inactive players, old rooms)
- All business logic triggers

**Edit when:** Changing game rules, validation, or turn logic

---

### 003_api.sql
**Creates:** RPC functions for client calls
- `create_game_room()` - Create room with host
- `advance_turn()` - Move to next turn
- `preview_cleanup()` - Debug cleanup (see what would be deleted)
- Permissions (GRANT EXECUTE)

**Edit when:** Adding new API endpoints or changing responses

---

### 004_realtime_and_security.sql
**Creates:** Realtime setup and RLS policies
- REPLICA IDENTITY FULL (for CDC OLD data)
- Adds tables to `supabase_realtime` publication
- Enables Row Level Security
- Creates RLS policies

**Edit when:** Adding tables to Realtime or changing security

---

### 005_scheduled_jobs.sql
**Creates:** Automated cleanup jobs
- Enables `pg_cron` extension
- Schedules cleanup jobs:
  - `cleanup-inactive-players` (every 30 seconds)
  - `cleanup-old-rooms` (every 5 minutes)

**Edit when:** Changing cleanup schedules or adding new jobs

---

## Running Migrations

### Development (Local)
```bash
# Start Supabase locally
supabase start

# Reset database (runs all migrations)
supabase db reset

# Run new migrations only
supabase migration up
```

### Production (Remote)
```bash
# Push migrations to remote database
supabase db push

# OR apply specific migration
supabase db push --db-url <your-db-url>
```

### Manual (SQL Editor)
1. Go to Supabase Dashboard → SQL Editor
2. Copy migration contents
3. Paste and run in order (001 → 005)

---

## Idempotent Migrations

All migrations are **idempotent** (safe to re-run):

- ✅ Tables use `CREATE TABLE IF NOT EXISTS`
- ✅ Functions use `CREATE OR REPLACE FUNCTION`
- ✅ Triggers use `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`
- ✅ Publications check existence before adding tables
- ✅ Scheduled jobs unschedule before rescheduling

**This means you can safely run migrations multiple times without errors.**

---

## Common Tasks

### Add a New Table
1. Edit **001_schema.sql**
2. Add `CREATE TABLE IF NOT EXISTS your_table (...)`
3. Add indexes if needed
4. Run migration

### Add New Game Logic
1. Edit **002_game_logic.sql**
2. Add function with `CREATE OR REPLACE FUNCTION`
3. Add trigger with `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`
4. Run migration

### Add New RPC Endpoint
1. Edit **003_api.sql**
2. Add `CREATE OR REPLACE FUNCTION your_rpc(...)`
3. Add `GRANT EXECUTE ON FUNCTION your_rpc TO authenticated, anon;`
4. Run migration

### Enable Realtime on New Table
1. Edit **004_realtime_and_security.sql**
2. Add `ALTER TABLE your_table REPLICA IDENTITY FULL;`
3. Add idempotent publication check (see existing examples)
4. Add RLS policies
5. Run migration

### Add Scheduled Job
1. Edit **005_scheduled_jobs.sql**
2. Add unschedule check in `DO $$ ... END $$;` block
3. Add `SELECT cron.schedule(...)` call
4. Run migration

---

## Debugging

### View Scheduled Jobs
```sql
SELECT * FROM cron.job;
```

### View Job History
```sql
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

### Preview Cleanup
```sql
SELECT * FROM preview_cleanup();
```

### Check Realtime Publication
```sql
SELECT * FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

### Check Triggers
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

---

## Migration History

See `MIGRATION_REORGANIZATION.md` for details on the migration reorganization.

Old migrations (before reorganization) are backed up in `supabase/migrations_old/`.

---

## Best Practices

1. **Always make migrations idempotent** (safe to re-run)
2. **Test migrations locally first** (`supabase db reset`)
3. **Never edit old migrations** - create new ones
4. **Use descriptive comments** in SQL
5. **Group related changes** in the same migration
6. **Maintain execution order** (001 → 002 → 003 → ...)

---

## Help

- **Full migration guide:** See `MIGRATION_REORGANIZATION.md`
- **Cleanup system:** See `CLEANUP_GUIDE.md`
- **Project architecture:** See `.claude/CLAUDE.md`

# Migration Reorganization Guide

## What Changed

Your migrations have been reorganized from **4 large files** into **5 focused, maintainable files**. All migrations are now **idempotent** (safe to re-run).

### Old Structure (Problems)
```
001_create_game_tables.sql         (95 lines)   ✅ OK
002_create_rls_policies.sql        (102 lines)  ✅ OK
003_enable_realtime_and_game_logic.sql (500 lines)  ❌ TOO BIG, NOT IDEMPOTENT
004_setup_automatic_cleanup.sql    (141 lines)  ⚠️ NOT IDEMPOTENT
```

**Issues:**
1. Migration 003 was **500 lines** mixing 5 different concerns
2. **Not idempotent** - caused errors when re-run:
   - `ERROR: relation "game_events" is already member of publication`
3. **Missing table** - `game_events` table referenced but never created

### New Structure (Fixed)
```
001_schema.sql                     (115 lines)  ✅ Tables, indexes, utilities
002_game_logic.sql                 (410 lines)  ✅ Validation, game logic, triggers
003_api.sql                        (190 lines)  ✅ RPC functions, permissions
004_realtime_and_security.sql      (210 lines)  ✅ Realtime setup, RLS policies
005_scheduled_jobs.sql             (80 lines)   ✅ pg_cron jobs
```

**Benefits:**
- ✅ **All migrations are idempotent** (safe to re-run)
- ✅ **Logical separation** by concern
- ✅ **Manageable file sizes** (80-410 lines)
- ✅ **Fixed game_events table** (now created in 001)
- ✅ **Fixed publication error** (checks before adding to publication)

---

## What's New

### 1. Added Missing `game_events` Table

The `game_events` table was referenced in migration 003 but never created. It's now in **001_schema.sql**:

```sql
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2. Fixed Publication Error (Idempotent)

Migration **004_realtime_and_security.sql** now checks before adding tables to the publication:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'game_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;
  END IF;
END;
$$;
```

This prevents the error:
```
ERROR: relation "game_events" is already member of publication (SQLSTATE 42710)
```

### 3. All Migrations Use `CREATE OR REPLACE`

Functions now use `CREATE OR REPLACE FUNCTION` instead of just `CREATE FUNCTION`, so they can be safely re-run.

### 4. Triggers Use `DROP TRIGGER IF EXISTS`

Before creating triggers, old ones are dropped:

```sql
DROP TRIGGER IF EXISTS validate_player_join_trigger ON game_players;
CREATE TRIGGER validate_player_join_trigger...
```

### 5. Scheduled Jobs Are Unscheduled Before Rescheduling

Migration **005_scheduled_jobs.sql** now unschedules existing jobs before creating new ones:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-inactive-players') THEN
    PERFORM cron.unschedule('cleanup-inactive-players');
  END IF;
END;
$$;

SELECT cron.schedule('cleanup-inactive-players', ...);
```

---

## How to Apply

### Option 1: Fresh Database (Recommended for Development)

If you're okay resetting your database:

```bash
# Reset database (WARNING: deletes all data)
supabase db reset

# Migrations will run automatically
```

### Option 2: Apply to Existing Database (Production-Safe)

The new migrations are idempotent, so you can safely run them on an existing database:

```bash
# Push migrations to remote database
supabase db push
```

**What will happen:**
- Tables already exist → Skipped (CREATE IF NOT EXISTS)
- Functions already exist → Replaced (CREATE OR REPLACE)
- Triggers already exist → Dropped and recreated
- Publication members already added → Checked and skipped
- Scheduled jobs already exist → Unscheduled and recreated

**Expected output:**
```
Applying migration 001_schema.sql... ✅
Applying migration 002_game_logic.sql... ✅
Applying migration 003_api.sql... ✅
Applying migration 004_realtime_and_security.sql... ✅
Applying migration 005_scheduled_jobs.sql... ✅
```

### Option 3: Manual Application (SQL Editor)

If you prefer to run migrations manually:

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste each migration in order (001 → 002 → 003 → 004 → 005)
3. Run each migration

---

## Migration Breakdown

### **001_schema.sql** - Database Schema
**What it does:**
- Creates 4 tables: `game_rooms`, `game_players`, `game_state`, `game_events`
- Creates indexes for performance
- Creates utility function `update_updated_at_column()`
- Sets up auto-update triggers for `updated_at` columns

**When to edit:**
- Adding new tables
- Adding new columns
- Adding new indexes

---

### **002_game_logic.sql** - Game Logic & Validation
**What it does:**
- Creates helper functions (`generate_room_code`)
- Creates validation functions (player join, game start, turn advancement)
- Creates game logic functions (initialize game state, process turns)
- Creates cleanup functions (inactive players, old rooms)
- Sets up all business logic triggers

**When to edit:**
- Changing game rules
- Adding new validation
- Modifying turn logic

---

### **003_api.sql** - API Layer (RPC Functions)
**What it does:**
- Creates RPC function `create_game_room`
- Creates RPC function `advance_turn`
- Creates RPC function `preview_cleanup`
- Grants permissions to `authenticated` and `anon` users

**When to edit:**
- Adding new RPC endpoints
- Changing API response formats
- Updating permissions

---

### **004_realtime_and_security.sql** - Realtime & RLS
**What it does:**
- Sets `REPLICA IDENTITY FULL` on all tables (for CDC OLD data)
- Adds tables to `supabase_realtime` publication (with idempotent checks)
- Enables Row Level Security (RLS) on all tables
- Creates permissive RLS policies (validation in triggers)

**When to edit:**
- Adding new tables to Realtime
- Changing security policies
- Restricting access

---

### **005_scheduled_jobs.sql** - Scheduled Cleanup Jobs
**What it does:**
- Enables `pg_cron` extension
- Schedules `cleanup-inactive-players` every 30 seconds
- Schedules `cleanup-old-rooms` every 5 minutes

**When to edit:**
- Changing cleanup schedules
- Adding new scheduled jobs
- Adjusting cleanup intervals

---

## Troubleshooting

### Issue: "relation already exists"

**No problem!** The migrations use `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION`, so they'll skip existing objects.

### Issue: "publication already has table"

**Fixed!** The new migration checks if the table is already in the publication before adding it.

### Issue: "pg_cron extension not available"

**Solution:** See `CLEANUP_GUIDE.md` for alternatives:
- Supabase Edge Functions with cron
- External cron services (GitHub Actions, cron-job.org)

### Issue: Want to rollback to old migrations

```bash
# Old migrations are backed up in supabase/migrations_old/
cp supabase/migrations_old/*.sql supabase/migrations/
```

---

## File Comparison

| Old File | New File(s) | What Moved |
|----------|-------------|------------|
| 001_create_game_tables.sql | **001_schema.sql** | Tables, indexes, `update_updated_at_column()` |
| | **002_game_logic.sql** | `cleanup_inactive_players()`, `cleanup_old_rooms()` |
| 002_create_rls_policies.sql | **004_realtime_and_security.sql** | All RLS policies |
| 003_enable_realtime_and_game_logic.sql | **001_schema.sql** | `game_events` table (NEW) |
| | **002_game_logic.sql** | All validation functions, game logic, triggers |
| | **003_api.sql** | RPC functions (`create_game_room`, `advance_turn`) |
| | **004_realtime_and_security.sql** | Realtime setup (REPLICA IDENTITY, publication) |
| 004_setup_automatic_cleanup.sql | **002_game_logic.sql** | `cleanup_old_rooms()` function (enhanced) |
| | **003_api.sql** | `preview_cleanup()` function |
| | **005_scheduled_jobs.sql** | pg_cron jobs |

---

## Next Steps

1. **Review the new migrations** to understand the structure
2. **Apply migrations** using `supabase db push`
3. **Verify everything works:**
   ```sql
   -- Check tables exist
   SELECT tablename FROM pg_tables WHERE schemaname = 'public';

   -- Check scheduled jobs
   SELECT * FROM cron.job;

   -- Check Realtime publication
   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

   -- Preview what cleanup would do
   SELECT * FROM preview_cleanup();
   ```
4. **Update your team** about the new migration structure

---

## Questions?

- **"Can I run these on an existing database?"** Yes! All migrations are idempotent.
- **"Will I lose data?"** No! These migrations modify structure, not data.
- **"Do I need to update my code?"** No! The API (RPC functions, tables) is identical.
- **"What if I want to split migrations differently?"** You can! Just maintain the execution order.

---

## Summary

✅ **Fixed:** Missing `game_events` table
✅ **Fixed:** Publication error (now idempotent)
✅ **Fixed:** Migrations now safe to re-run
✅ **Improved:** Better organization (5 focused files)
✅ **Improved:** Easier to maintain and navigate
✅ **Backward compatible:** Same database schema and API

Old migrations are backed up in `supabase/migrations_old/` if you need them.

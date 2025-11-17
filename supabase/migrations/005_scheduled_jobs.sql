-- ============================================================================
-- Migration 005: Scheduled Cleanup Jobs
-- ============================================================================
-- Sets up pg_cron scheduled jobs for automatic cleanup
-- Safe to re-run (idempotent)
-- ============================================================================

-- ============================================================================
-- ENABLE PG_CRON EXTENSION
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- SCHEDULE CLEANUP JOBS
-- ============================================================================

-- Unschedule existing jobs if they exist (idempotent)
DO $$
BEGIN
  -- Unschedule cleanup-inactive-players if exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-inactive-players') THEN
    PERFORM cron.unschedule('cleanup-inactive-players');
  END IF;

  -- Unschedule cleanup-old-rooms if exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-rooms') THEN
    PERFORM cron.unschedule('cleanup-old-rooms');
  END IF;
END;
$$;

-- Schedule: Run cleanup_inactive_players() every 30 seconds
-- This removes players who haven't sent a heartbeat in 30+ seconds
SELECT cron.schedule(
  'cleanup-inactive-players',           -- Job name
  '*/30 * * * * *',                     -- Every 30 seconds (cron format: second minute hour day month weekday)
  $$ SELECT cleanup_inactive_players() $$
);

-- Schedule: Run cleanup_old_rooms() every 5 minutes
-- This removes rooms older than 2 hours or with 0 players
SELECT cron.schedule(
  'cleanup-old-rooms',                  -- Job name
  '*/5 * * * *',                        -- Every 5 minutes
  $$ SELECT cleanup_old_rooms() $$
);

-- ============================================================================
-- VERIFY JOBS ARE SCHEDULED
-- ============================================================================

-- This will show you the scheduled jobs
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname IN ('cleanup-inactive-players', 'cleanup-old-rooms');

  RAISE NOTICE 'Scheduled % cleanup jobs', job_count;
END;
$$;

-- ============================================================================
-- NOTES
-- ============================================================================
-- To view scheduled jobs: SELECT * FROM cron.job;
-- To view job history: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- To preview cleanup: SELECT * FROM preview_cleanup();
--
-- If pg_cron is not available on your plan:
-- - Use Supabase Edge Functions with scheduled cron jobs
-- - Use external cron service (cron-job.org, GitHub Actions, etc.)
-- - See CLEANUP_GUIDE.md for alternative solutions

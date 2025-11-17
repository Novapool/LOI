-- Migration 004: Setup Automatic Cleanup with pg_cron
-- This migration schedules periodic cleanup jobs to remove:
-- 1. Inactive players (no heartbeat for 30+ seconds)
-- 2. Old rooms (created more than 2 hours ago)

-- ============================================================================
-- STEP 1: Enable pg_cron extension (if not already enabled)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- STEP 2: Schedule cleanup jobs
-- ============================================================================

-- Schedule: Run cleanup_inactive_players() every 30 seconds
-- This removes players who haven't sent a heartbeat in 30+ seconds
SELECT cron.schedule(
  'cleanup-inactive-players',           -- Job name
  '*/30 * * * * *',                     -- Every 30 seconds (cron format: second minute hour day month weekday)
  $$ SELECT cleanup_inactive_players() $$
);

-- Schedule: Run cleanup_old_rooms() every 5 minutes
-- This removes rooms older than 2 hours
SELECT cron.schedule(
  'cleanup-old-rooms',                  -- Job name
  '*/5 * * * *',                        -- Every 5 minutes
  $$ SELECT cleanup_old_rooms() $$
);

-- ============================================================================
-- STEP 3: Enhanced cleanup_old_rooms function with empty room cleanup
-- ============================================================================

-- Update cleanup_old_rooms to also delete empty rooms (0 players)
CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS void AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete rooms older than 2 hours
  WITH deleted AS (
    DELETE FROM game_rooms
    WHERE created_at < NOW() - INTERVAL '2 hours'
    RETURNING room_code
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % old rooms (>2 hours)', deleted_count;
  END IF;

  -- Delete empty rooms (no players)
  WITH empty_rooms AS (
    SELECT gr.room_code
    FROM game_rooms gr
    LEFT JOIN game_players gp ON gr.room_code = gp.room_code
    WHERE gp.room_code IS NULL
  ),
  deleted_empty AS (
    DELETE FROM game_rooms
    WHERE room_code IN (SELECT room_code FROM empty_rooms)
    RETURNING room_code
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted_empty;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % empty rooms (0 players)', deleted_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: Manual cleanup function (for testing/debugging)
-- ============================================================================

-- This function can be called manually to see what would be cleaned up
CREATE OR REPLACE FUNCTION preview_cleanup()
RETURNS TABLE(
  cleanup_type TEXT,
  room_code TEXT,
  details JSONB
) AS $$
BEGIN
  -- Preview inactive players
  RETURN QUERY
  SELECT
    'inactive_player'::TEXT,
    gp.room_code,
    jsonb_build_object(
      'playerName', gp.player_name,
      'playerId', gp.player_id,
      'lastHeartbeat', gp.last_heartbeat,
      'secondsSinceHeartbeat', EXTRACT(EPOCH FROM (NOW() - gp.last_heartbeat))::INTEGER
    )
  FROM game_players gp
  WHERE gp.last_heartbeat < NOW() - INTERVAL '30 seconds';

  -- Preview old rooms
  RETURN QUERY
  SELECT
    'old_room'::TEXT,
    gr.room_code,
    jsonb_build_object(
      'createdAt', gr.created_at,
      'ageHours', EXTRACT(EPOCH FROM (NOW() - gr.created_at)) / 3600,
      'status', gr.status
    )
  FROM game_rooms gr
  WHERE gr.created_at < NOW() - INTERVAL '2 hours';

  -- Preview empty rooms
  RETURN QUERY
  SELECT
    'empty_room'::TEXT,
    gr.room_code,
    jsonb_build_object(
      'createdAt', gr.created_at,
      'status', gr.status,
      'playerCount', 0
    )
  FROM game_rooms gr
  LEFT JOIN game_players gp ON gr.room_code = gp.room_code
  WHERE gp.room_code IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION preview_cleanup TO authenticated, anon;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION cleanup_inactive_players IS 'Removes players with no heartbeat for 30+ seconds (scheduled every 30s)';
COMMENT ON FUNCTION cleanup_old_rooms IS 'Removes rooms older than 2 hours or with 0 players (scheduled every 5min)';
COMMENT ON FUNCTION preview_cleanup IS 'Preview what would be cleaned up (for debugging)';

-- ============================================================================
-- Migration 008: Protect Active Games from Cleanup
-- ============================================================================
-- Purpose: Update cleanup functions to skip removing players from rooms with
--          status='playing' to prevent mid-game disruptions.
--
-- Changes:
--   1. Update cleanup_inactive_players_on_heartbeat() to check room status
--   2. Update cleanup_inactive_players() to only clean lobby/finished rooms
--
-- Author: Claude
-- Date: 2025-01-18
-- ============================================================================

-- Drop existing functions to allow recreation with same signature
DROP FUNCTION IF EXISTS cleanup_inactive_players_on_heartbeat() CASCADE;
DROP FUNCTION IF EXISTS cleanup_inactive_players() CASCADE;

-- Function: Cleanup inactive players (triggered on heartbeat) - UPDATED
-- Now checks room status and only removes players from lobby/finished games
CREATE OR REPLACE FUNCTION cleanup_inactive_players_on_heartbeat()
RETURNS TRIGGER AS $$
DECLARE
  inactive_threshold TIMESTAMPTZ;
  room_status TEXT;
  removed_host RECORD;
  new_host RECORD;
  remaining_count INTEGER;
BEGIN
  -- Get room status first
  SELECT status INTO room_status
  FROM game_rooms
  WHERE room_code = NEW.room_code;

  -- Skip cleanup if game is currently being played
  IF room_status = 'playing' THEN
    -- Log that cleanup was skipped for active game
    INSERT INTO game_events (room_code, event, payload)
    VALUES (NEW.room_code, 'cleanup_skipped', jsonb_build_object(
      'reason', 'game_active',
      'status', room_status,
      'timestamp', NOW()
    ));

    RETURN NEW;
  END IF;

  -- Define threshold (30 seconds ago)
  inactive_threshold := NOW() - INTERVAL '30 seconds';

  -- Find and remove inactive players in the same room (only if not playing)
  WITH deleted_players AS (
    DELETE FROM game_players
    WHERE room_code = NEW.room_code
      AND last_heartbeat < inactive_threshold
    RETURNING *
  )
  SELECT * INTO removed_host FROM deleted_players WHERE is_host = TRUE LIMIT 1;

  -- If removed player was host, transfer to next player
  IF FOUND THEN
    -- Count remaining players
    SELECT COUNT(*) INTO remaining_count FROM game_players WHERE room_code = NEW.room_code;

    IF remaining_count > 0 THEN
      -- Transfer host to oldest remaining player
      SELECT * INTO new_host FROM game_players
      WHERE room_code = NEW.room_code
      ORDER BY joined_at ASC
      LIMIT 1;

      UPDATE game_players
      SET is_host = TRUE
      WHERE room_code = NEW.room_code AND player_id = new_host.player_id;

      UPDATE game_rooms
      SET host_id = new_host.player_id
      WHERE room_code = NEW.room_code;

      -- Log host transfer
      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'host_transferred', jsonb_build_object(
        'oldHostId', removed_host.player_id,
        'newHostId', new_host.player_id
      ));
    ELSE
      -- No players left, delete the room
      DELETE FROM game_rooms WHERE room_code = NEW.room_code;

      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'room_deleted', jsonb_build_object(
        'reason', 'all_players_left'
      ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup all inactive players (for scheduled job) - UPDATED
-- Now only removes players from lobby and finished rooms, not active games
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS void AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete inactive players ONLY from rooms that are not currently playing
  WITH deleted_players AS (
    DELETE FROM game_players
    WHERE last_heartbeat < NOW() - INTERVAL '30 seconds'
    AND room_code IN (
      SELECT room_code FROM game_rooms WHERE status != 'playing'
    )
    RETURNING player_id, room_code
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted_players;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % inactive players from lobby/finished rooms', deleted_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION QUERIES (for testing after migration)
-- ============================================================================

-- Query to verify cleanup logic:
-- This shows which rooms would be affected by cleanup
COMMENT ON FUNCTION cleanup_inactive_players IS
'Removes players with no heartbeat for 30+ seconds from lobby and finished rooms only. Active games (status=playing) are protected from cleanup.';

COMMENT ON FUNCTION cleanup_inactive_players_on_heartbeat IS
'Reactive trigger that removes inactive players when heartbeat updates occur. Skips cleanup for rooms with status=playing to protect active games.';

-- Recreate the trigger (dropped with CASCADE above)
DROP TRIGGER IF EXISTS cleanup_inactive_players_trigger ON game_players;
CREATE TRIGGER cleanup_inactive_players_trigger
  AFTER UPDATE OF last_heartbeat ON game_players
  FOR EACH ROW
  WHEN (NEW.last_heartbeat > OLD.last_heartbeat)
  EXECUTE FUNCTION cleanup_inactive_players_on_heartbeat();

-- Example validation query (run manually after migration):
-- SELECT
--   gr.room_code,
--   gr.status,
--   COUNT(gp.player_id) as player_count,
--   MAX(gp.last_heartbeat) as most_recent_heartbeat,
--   EXTRACT(EPOCH FROM (NOW() - MAX(gp.last_heartbeat))) as seconds_since_heartbeat
-- FROM game_rooms gr
-- LEFT JOIN game_players gp ON gr.room_code = gp.room_code
-- GROUP BY gr.room_code, gr.status
-- ORDER BY seconds_since_heartbeat DESC;

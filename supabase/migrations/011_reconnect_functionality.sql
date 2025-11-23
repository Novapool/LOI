-- ============================================================================
-- Migration 011: Reconnect Functionality
-- ============================================================================
-- Adds session management, disconnection tracking, and turn timeout features
-- to support player reconnection and auto-skip for disconnected players
-- ============================================================================

-- ============================================================================
-- SCHEMA CHANGES
-- ============================================================================

-- Add session management columns to game_players
ALTER TABLE game_players
ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_disconnected BOOLEAN DEFAULT false;

-- Add turn timeout columns to game_state
ALTER TABLE game_state
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS turn_timeout_seconds INTEGER DEFAULT 60;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_game_players_session_token ON game_players(session_token);
CREATE INDEX IF NOT EXISTS idx_game_players_is_disconnected ON game_players(is_disconnected);
CREATE INDEX IF NOT EXISTS idx_game_players_disconnected_at ON game_players(disconnected_at);

-- ============================================================================
-- UPDATED CLEANUP FUNCTIONS
-- ============================================================================

-- Function: Mark inactive players as disconnected (instead of deleting)
-- This gives them a 5-minute grace period to reconnect
CREATE OR REPLACE FUNCTION cleanup_inactive_players_on_heartbeat()
RETURNS TRIGGER AS $$
DECLARE
  inactive_threshold TIMESTAMPTZ;
  disconnected_player RECORD;
  removed_host RECORD;
  new_host RECORD;
  remaining_count INTEGER;
BEGIN
  -- Define threshold (120 seconds ago - 2 minutes)
  inactive_threshold := NOW() - INTERVAL '120 seconds';

  -- Mark inactive players as disconnected (don't delete yet)
  UPDATE game_players
  SET is_disconnected = true,
      disconnected_at = NOW()
  WHERE room_code = NEW.room_code
    AND last_heartbeat < inactive_threshold
    AND is_disconnected = false;  -- Only mark once

  -- Check if we just marked a host as disconnected
  SELECT * INTO removed_host FROM game_players
  WHERE room_code = NEW.room_code
    AND is_host = TRUE
    AND is_disconnected = TRUE
  LIMIT 1;

  -- If host was disconnected, transfer to next active player
  IF FOUND THEN
    -- Count remaining active players
    SELECT COUNT(*) INTO remaining_count
    FROM game_players
    WHERE room_code = NEW.room_code
      AND is_disconnected = false;

    IF remaining_count > 0 THEN
      -- Transfer host to oldest remaining active player
      SELECT * INTO new_host FROM game_players
      WHERE room_code = NEW.room_code
        AND is_disconnected = false
      ORDER BY joined_at ASC
      LIMIT 1;

      -- Remove host flag from disconnected player
      UPDATE game_players
      SET is_host = false
      WHERE room_code = NEW.room_code AND player_id = removed_host.player_id;

      -- Set new host
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
        'newHostId', new_host.player_id,
        'reason', 'host_disconnected'
      ));
    ELSE
      -- No active players left, delete the room
      DELETE FROM game_rooms WHERE room_code = NEW.room_code;

      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'room_deleted', jsonb_build_object(
        'reason', 'all_players_disconnected'
      ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Permanently delete players disconnected for 5+ minutes
CREATE OR REPLACE FUNCTION cleanup_disconnected_players()
RETURNS void AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete players that have been disconnected for more than 5 minutes
  WITH deleted AS (
    DELETE FROM game_players
    WHERE is_disconnected = true
      AND disconnected_at < NOW() - INTERVAL '5 minutes'
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'Permanently deleted % players (disconnected >5 min)', deleted_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup all inactive players (for scheduled job)
-- Updated to mark as disconnected instead of immediate deletion
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS void AS $$
BEGIN
  -- Mark players as disconnected if no heartbeat for 120 seconds
  UPDATE game_players
  SET is_disconnected = true,
      disconnected_at = NOW()
  WHERE last_heartbeat < NOW() - INTERVAL '120 seconds'
    AND is_disconnected = false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RECONNECTION RPC FUNCTIONS
-- ============================================================================

-- Function: Reconnect a player using session token
CREATE OR REPLACE FUNCTION reconnect_player(
  room_code_param TEXT,
  player_id_param TEXT,
  session_token_param UUID
)
RETURNS JSONB AS $$
DECLARE
  player_record RECORD;
  room_record RECORD;
  game_state_record RECORD;
  players_data JSONB;
BEGIN
  -- Validate player exists with matching session token
  SELECT * INTO player_record
  FROM game_players
  WHERE room_code = room_code_param
    AND player_id = player_id_param
    AND session_token = session_token_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_SESSION',
      'message', 'Session not found or expired. Please rejoin the room.'
    );
  END IF;

  -- Mark player as reconnected
  UPDATE game_players
  SET is_disconnected = false,
      disconnected_at = NULL,
      last_heartbeat = NOW()
  WHERE room_code = room_code_param
    AND player_id = player_id_param;

  -- Get room data
  SELECT * INTO room_record
  FROM game_rooms
  WHERE room_code = room_code_param;

  -- Get all players
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', player_id,
      'name', player_name,
      'isHost', is_host,
      'isDisconnected', is_disconnected,
      'disconnectedAt', disconnected_at
    ) ORDER BY joined_at ASC
  ) INTO players_data
  FROM game_players
  WHERE room_code = room_code_param;

  -- Get game state if game is active
  SELECT * INTO game_state_record
  FROM game_state
  WHERE room_code = room_code_param;

  -- Log reconnection event
  INSERT INTO game_events (room_code, event, payload)
  VALUES (room_code_param, 'player_reconnected', jsonb_build_object(
    'playerId', player_id_param,
    'playerName', player_record.player_name
  ));

  -- Return full game state
  RETURN jsonb_build_object(
    'success', true,
    'room', jsonb_build_object(
      'roomCode', room_record.room_code,
      'status', room_record.status,
      'hostId', room_record.host_id,
      'settings', room_record.settings
    ),
    'players', players_data,
    'gameState', CASE
      WHEN game_state_record IS NOT NULL THEN
        jsonb_build_object(
          'currentLevel', game_state_record.current_level,
          'playerOrder', game_state_record.player_order,
          'currentAskerIndex', game_state_record.current_asker_index,
          'currentAnswererIndex', game_state_record.current_answerer_index,
          'currentQuestion', game_state_record.current_question,
          'questionCount', game_state_record.question_count,
          'askedQuestions', game_state_record.asked_questions,
          'isCustomQuestion', game_state_record.is_custom_question,
          'rerollsUsed', game_state_record.rerolls_used,
          'turnStartedAt', game_state_record.turn_started_at,
          'turnTimeoutSeconds', game_state_record.turn_timeout_seconds
        )
      ELSE NULL
    END
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TURN TIMEOUT & AUTO-SKIP FUNCTIONS
-- ============================================================================

-- Function: Check if current turn has timed out and skip if player is disconnected
CREATE OR REPLACE FUNCTION check_turn_timeout(
  room_code_param TEXT
)
RETURNS JSONB AS $$
DECLARE
  game_state_record RECORD;
  current_player_id TEXT;
  current_player RECORD;
  turn_age_seconds INTEGER;
  next_asker_index INTEGER;
  next_answerer_index INTEGER;
  player_count INTEGER;
  skipped_player_name TEXT;
BEGIN
  -- Get game state
  SELECT * INTO game_state_record
  FROM game_state
  WHERE room_code = room_code_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'GAME_NOT_FOUND');
  END IF;

  -- Check if turn_started_at is set
  IF game_state_record.turn_started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_TURN');
  END IF;

  -- Calculate how long current turn has been active
  turn_age_seconds := EXTRACT(EPOCH FROM (NOW() - game_state_record.turn_started_at));

  -- If turn hasn't timed out yet, return
  IF turn_age_seconds < game_state_record.turn_timeout_seconds THEN
    RETURN jsonb_build_object(
      'success', true,
      'timedOut', false,
      'remainingSeconds', game_state_record.turn_timeout_seconds - turn_age_seconds
    );
  END IF;

  -- Get current asker's player_id from player_order
  current_player_id := game_state_record.player_order->>game_state_record.current_asker_index;

  -- Check if current player is disconnected
  SELECT * INTO current_player
  FROM game_players
  WHERE room_code = room_code_param
    AND player_id = current_player_id;

  IF NOT FOUND OR current_player.is_disconnected = false THEN
    -- Player is connected, don't auto-skip
    RETURN jsonb_build_object(
      'success', true,
      'timedOut', true,
      'skipped', false,
      'reason', 'player_connected'
    );
  END IF;

  -- Player is disconnected and turn timed out - auto-skip
  player_count := jsonb_array_length(game_state_record.player_order);
  next_asker_index := (game_state_record.current_answerer_index) % player_count;
  next_answerer_index := (game_state_record.current_answerer_index + 1) % player_count;

  -- Update game state to skip turn
  UPDATE game_state
  SET current_asker_index = next_asker_index,
      current_answerer_index = next_answerer_index,
      current_question = NULL,
      is_custom_question = false,
      turn_started_at = NOW()  -- Reset turn timer
  WHERE room_code = room_code_param;

  -- Log skip event
  INSERT INTO game_events (room_code, event, payload)
  VALUES (room_code_param, 'turn_skipped', jsonb_build_object(
    'playerId', current_player_id,
    'playerName', current_player.player_name,
    'reason', 'timeout_disconnected',
    'turnAgeSeconds', turn_age_seconds
  ));

  RETURN jsonb_build_object(
    'success', true,
    'timedOut', true,
    'skipped', true,
    'skippedPlayerId', current_player_id,
    'skippedPlayerName', current_player.player_name,
    'nextAskerIndex', next_asker_index,
    'nextAnswererIndex', next_answerer_index
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER TO SET TURN START TIME
-- ============================================================================

-- Function: Set turn_started_at when asker/answerer changes
CREATE OR REPLACE FUNCTION set_turn_started_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If question was just cleared (new turn starting), set turn_started_at
  IF (NEW.current_question IS NULL AND OLD.current_question IS NOT NULL) OR
     (NEW.current_asker_index != OLD.current_asker_index) THEN
    NEW.turn_started_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_turn_started_at_trigger ON game_state;
CREATE TRIGGER set_turn_started_at_trigger
  BEFORE UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION set_turn_started_at();

-- ============================================================================
-- UPDATE create_game_room TO GENERATE SESSION TOKEN
-- ============================================================================

-- Drop existing function first
DROP FUNCTION IF EXISTS create_game_room(TEXT, TEXT, JSONB);

-- Update create_game_room to return session token
CREATE FUNCTION create_game_room(
  player_name TEXT,
  player_id TEXT,
  game_settings JSONB
)
RETURNS JSONB AS $$
DECLARE
  new_room_code TEXT;
  new_room game_rooms%ROWTYPE;
  new_player game_players%ROWTYPE;
  new_session_token UUID;
BEGIN
  -- Generate unique room code
  new_room_code := generate_room_code();

  -- Create room
  INSERT INTO game_rooms (room_code, host_id, status, settings)
  VALUES (new_room_code, player_id, 'lobby', game_settings)
  RETURNING * INTO new_room;

  -- Generate session token
  new_session_token := gen_random_uuid();

  -- Create host player with session token
  INSERT INTO game_players (room_code, player_id, player_name, is_host, session_token)
  VALUES (new_room_code, player_id, player_name, true, new_session_token)
  RETURNING * INTO new_player;

  -- Log room creation
  INSERT INTO game_events (room_code, event, payload)
  VALUES (new_room_code, 'room_created', jsonb_build_object(
    'hostId', player_id,
    'hostName', player_name
  ));

  -- Return room and player data with session token
  RETURN jsonb_build_object(
    'success', true,
    'room', jsonb_build_object(
      'roomCode', new_room.room_code,
      'hostId', new_room.host_id,
      'status', new_room.status,
      'settings', new_room.settings
    ),
    'player', jsonb_build_object(
      'id', new_player.player_id,
      'name', new_player.player_name,
      'isHost', new_player.is_host,
      'sessionToken', new_session_token
    )
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN game_players.session_token IS 'Unique token for reconnection (stored in localStorage)';
COMMENT ON COLUMN game_players.disconnected_at IS 'Timestamp when player was marked as disconnected';
COMMENT ON COLUMN game_players.is_disconnected IS 'Flag indicating if player is currently disconnected';
COMMENT ON COLUMN game_state.turn_started_at IS 'Timestamp when current turn started (for timeout detection)';
COMMENT ON COLUMN game_state.turn_timeout_seconds IS 'Seconds before turn auto-skips for disconnected players';

COMMENT ON FUNCTION reconnect_player IS 'Reconnects a player using their session token';
COMMENT ON FUNCTION check_turn_timeout IS 'Checks if current turn has timed out and auto-skips if player is disconnected';
COMMENT ON FUNCTION cleanup_disconnected_players IS 'Permanently deletes players disconnected for 5+ minutes';

-- ============================================================================
-- SCHEDULED JOB FOR PERMANENT DELETION
-- ============================================================================

-- Unschedule existing job if it exists (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-disconnected-players') THEN
    PERFORM cron.unschedule('cleanup-disconnected-players');
  END IF;
END;
$$;

-- Schedule: Run cleanup_disconnected_players() every 2 minutes
-- This permanently deletes players who have been disconnected for 5+ minutes
SELECT cron.schedule(
  'cleanup-disconnected-players',       -- Job name
  '*/2 * * * *',                        -- Every 2 minutes
  $$ SELECT cleanup_disconnected_players() $$
);

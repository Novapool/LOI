-- ============================================================================
-- Migration 002: Game Logic & Validation
-- ============================================================================
-- Creates validation functions, game logic, cleanup functions, and triggers
-- Safe to re-run (idempotent)
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Generate unique 4-character room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
  code_exists BOOLEAN;
  attempts INTEGER := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..4 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM game_rooms WHERE room_code = result) INTO code_exists;

    IF NOT code_exists THEN
      RETURN result;
    END IF;

    attempts := attempts + 1;
    IF attempts >= 10 THEN
      RAISE EXCEPTION 'Failed to generate unique room code after 10 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION FUNCTIONS
-- ============================================================================

-- Function: Validate player can join room
CREATE OR REPLACE FUNCTION validate_player_join()
RETURNS TRIGGER AS $$
DECLARE
  room_record RECORD;
  player_count INTEGER;
BEGIN
  -- Get room details
  SELECT * INTO room_record FROM game_rooms WHERE room_code = NEW.room_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check room status
  IF room_record.status = 'playing' THEN
    RAISE EXCEPTION 'Game has already started. Cannot join.';
  END IF;

  IF room_record.status = 'finished' THEN
    RAISE EXCEPTION 'Game has finished. Cannot join.';
  END IF;

  -- Check player count (max 10)
  SELECT COUNT(*) INTO player_count FROM game_players WHERE room_code = NEW.room_code;

  IF player_count >= 10 THEN
    RAISE EXCEPTION 'Room is full (max 10 players)';
  END IF;

  -- Set joined_at and last_heartbeat timestamps
  NEW.joined_at := NOW();
  NEW.last_heartbeat := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Validate game can start
CREATE OR REPLACE FUNCTION validate_game_start()
RETURNS TRIGGER AS $$
DECLARE
  player_count INTEGER;
BEGIN
  -- Only validate when status changes to 'playing'
  IF NEW.status = 'playing' AND OLD.status = 'lobby' THEN
    -- Check minimum players (3 required)
    SELECT COUNT(*) INTO player_count FROM game_players WHERE room_code = NEW.room_code;

    IF player_count < 3 THEN
      RAISE EXCEPTION 'Need at least 3 players to start';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Validate turn advancement
CREATE OR REPLACE FUNCTION validate_turn_advancement()
RETURNS TRIGGER AS $$
DECLARE
  current_room RECORD;
BEGIN
  -- Get room details
  SELECT * INTO current_room FROM game_rooms WHERE room_code = NEW.room_code;

  IF current_room.status != 'playing' THEN
    RAISE EXCEPTION 'Game is not currently playing';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GAME LOGIC FUNCTIONS
-- ============================================================================

-- Function: Initialize game state when game starts
CREATE OR REPLACE FUNCTION initialize_game_state()
RETURNS TRIGGER AS $$
DECLARE
  player_count INTEGER;
  random_index INTEGER;
  start_level INTEGER;
BEGIN
  -- Only run when status changes from 'lobby' to 'playing'
  IF NEW.status = 'playing' AND OLD.status = 'lobby' THEN
    -- Count players
    SELECT COUNT(*) INTO player_count FROM game_players WHERE room_code = NEW.room_code;

    -- Select random first player
    random_index := floor(random() * player_count)::INTEGER;

    -- Get start level from settings (default 5)
    start_level := COALESCE((NEW.settings->>'startLevel')::INTEGER, 5);

    -- Create initial game state
    INSERT INTO game_state (
      room_code,
      current_level,
      current_player_index,
      current_question,
      question_count,
      asked_questions
    ) VALUES (
      NEW.room_code,
      start_level,
      random_index,
      NULL, -- Client will set first question
      0,
      '[]'::jsonb
    )
    ON CONFLICT (room_code) DO UPDATE SET
      current_level = start_level,
      current_player_index = random_index,
      question_count = 0,
      asked_questions = '[]'::jsonb;

    -- Log game start event
    INSERT INTO game_events (room_code, event, payload)
    VALUES (NEW.room_code, 'game_started', jsonb_build_object(
      'startLevel', start_level,
      'firstPlayerIndex', random_index,
      'playerCount', player_count
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Process turn advancement logic
CREATE OR REPLACE FUNCTION process_next_turn()
RETURNS TRIGGER AS $$
DECLARE
  room_settings JSONB;
  questions_per_level INTEGER;
  new_question_count INTEGER;
  new_level INTEGER;
  player_count INTEGER;
  next_index INTEGER;
BEGIN
  -- Get room settings
  SELECT settings INTO room_settings FROM game_rooms WHERE room_code = NEW.room_code;

  -- Get questions per level (default 3)
  questions_per_level := COALESCE((room_settings->>'questionsPerLevel')::INTEGER, 3);

  -- Calculate new question count and level
  new_question_count := NEW.question_count;
  new_level := NEW.current_level;

  -- Check if we need to decrease level
  IF new_question_count >= questions_per_level THEN
    IF new_level > 1 THEN
      new_level := new_level - 1;
      new_question_count := 0;

      -- Log level change
      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'level_changed', jsonb_build_object(
        'oldLevel', NEW.current_level,
        'newLevel', new_level
      ));
    ELSE
      -- Game finished (level 1 complete)
      UPDATE game_rooms SET status = 'finished' WHERE room_code = NEW.room_code;

      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'game_finished', jsonb_build_object(
        'finalLevel', 1
      ));

      RETURN NEW;
    END IF;
  END IF;

  -- Select next random player (excluding current)
  SELECT COUNT(*) INTO player_count FROM game_players WHERE room_code = NEW.room_code;

  IF player_count > 1 THEN
    LOOP
      next_index := floor(random() * player_count)::INTEGER;
      EXIT WHEN next_index != NEW.current_player_index;
    END LOOP;
  ELSE
    next_index := NEW.current_player_index;
  END IF;

  -- Update game state with new values
  NEW.current_level := new_level;
  NEW.current_player_index := next_index;
  NEW.question_count := new_question_count;
  NEW.current_question := NULL; -- Client will set new question
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function: Cleanup inactive players (triggered on heartbeat)
CREATE OR REPLACE FUNCTION cleanup_inactive_players_on_heartbeat()
RETURNS TRIGGER AS $$
DECLARE
  inactive_threshold TIMESTAMPTZ;
  removed_host RECORD;
  new_host RECORD;
  remaining_count INTEGER;
BEGIN
  -- Define threshold (30 seconds ago)
  inactive_threshold := NOW() - INTERVAL '30 seconds';

  -- Find and remove inactive players in the same room
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

-- Function: Cleanup all inactive players (for scheduled job)
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS void AS $$
BEGIN
  DELETE FROM game_players
  WHERE last_heartbeat < NOW() - INTERVAL '30 seconds';
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup old and empty rooms (for scheduled job)
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
-- TRIGGERS
-- ============================================================================

-- Trigger: Validate player joins
DROP TRIGGER IF EXISTS validate_player_join_trigger ON game_players;
CREATE TRIGGER validate_player_join_trigger
  BEFORE INSERT ON game_players
  FOR EACH ROW
  EXECUTE FUNCTION validate_player_join();

-- Trigger: Validate game start
DROP TRIGGER IF EXISTS validate_game_start_trigger ON game_rooms;
CREATE TRIGGER validate_game_start_trigger
  BEFORE UPDATE ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION validate_game_start();

-- Trigger: Initialize game state on game start
DROP TRIGGER IF EXISTS initialize_game_state_trigger ON game_rooms;
CREATE TRIGGER initialize_game_state_trigger
  AFTER UPDATE ON game_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'playing' AND OLD.status = 'lobby')
  EXECUTE FUNCTION initialize_game_state();

-- Trigger: Validate turn advancement
DROP TRIGGER IF EXISTS validate_turn_advancement_trigger ON game_state;
CREATE TRIGGER validate_turn_advancement_trigger
  BEFORE UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION validate_turn_advancement();

-- Trigger: Process turn logic after update
DROP TRIGGER IF EXISTS process_next_turn_trigger ON game_state;
CREATE TRIGGER process_next_turn_trigger
  BEFORE UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION process_next_turn();

-- Trigger: Cleanup inactive players on heartbeat
DROP TRIGGER IF EXISTS cleanup_inactive_players_trigger ON game_players;
CREATE TRIGGER cleanup_inactive_players_trigger
  AFTER UPDATE ON game_players
  FOR EACH ROW
  WHEN (NEW.last_heartbeat > OLD.last_heartbeat)
  EXECUTE FUNCTION cleanup_inactive_players_on_heartbeat();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION generate_room_code IS 'Generates a unique 4-character room code';
COMMENT ON FUNCTION validate_player_join IS 'Validates player can join room (trigger function)';
COMMENT ON FUNCTION validate_game_start IS 'Validates game can start with minimum players (trigger function)';
COMMENT ON FUNCTION validate_turn_advancement IS 'Validates turn can be advanced (trigger function)';
COMMENT ON FUNCTION initialize_game_state IS 'Initializes game state when game starts (trigger function)';
COMMENT ON FUNCTION process_next_turn IS 'Processes turn logic and level transitions (trigger function)';
COMMENT ON FUNCTION cleanup_inactive_players_on_heartbeat IS 'Removes inactive players when heartbeat updated (trigger function)';
COMMENT ON FUNCTION cleanup_inactive_players IS 'Removes all players with no heartbeat for 30+ seconds (scheduled job)';
COMMENT ON FUNCTION cleanup_old_rooms IS 'Removes rooms older than 2 hours or with 0 players (scheduled job)';

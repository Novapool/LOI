-- Migration 003: Enable Full Realtime Support and Move Game Logic to Database
-- This migration:
-- 1. Enables full Realtime replication (replica identity FULL)
-- 2. Adds all tables to supabase_realtime publication
-- 3. Creates validation functions and triggers to replace Edge Functions
-- 4. Creates RPC helper functions for complex operations

-- ============================================================================
-- STEP 1: Enable Full Realtime Replication
-- ============================================================================

-- Set replica identity to FULL so OLD data is available in UPDATE/DELETE events
ALTER TABLE game_rooms REPLICA IDENTITY FULL;
ALTER TABLE game_players REPLICA IDENTITY FULL;
ALTER TABLE game_state REPLICA IDENTITY FULL;
ALTER TABLE game_events REPLICA IDENTITY FULL;

-- Add all tables to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE game_events;

-- ============================================================================
-- STEP 2: Validation Functions (to replace Edge Function validation logic)
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
-- STEP 3: Game Logic Functions (to replace Edge Function business logic)
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
    );

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
  asked_questions_array JSONB;
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

-- Function: Cleanup inactive players (runs on heartbeat update)
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS TRIGGER AS $$
DECLARE
  inactive_threshold TIMESTAMPTZ;
  removed_host RECORD;
  new_host RECORD;
  remaining_count INTEGER;
BEGIN
  -- Define threshold (30 seconds ago)
  inactive_threshold := NOW() - INTERVAL '30 seconds';

  -- Find and remove inactive players
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

-- ============================================================================
-- STEP 4: Create Triggers
-- ============================================================================

-- Trigger: Validate player joins
CREATE TRIGGER validate_player_join_trigger
  BEFORE INSERT ON game_players
  FOR EACH ROW
  EXECUTE FUNCTION validate_player_join();

-- Trigger: Validate game start
CREATE TRIGGER validate_game_start_trigger
  BEFORE UPDATE ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION validate_game_start();

-- Trigger: Initialize game state on game start
CREATE TRIGGER initialize_game_state_trigger
  AFTER UPDATE ON game_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'playing' AND OLD.status = 'lobby')
  EXECUTE FUNCTION initialize_game_state();

-- Trigger: Validate turn advancement
CREATE TRIGGER validate_turn_advancement_trigger
  BEFORE UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION validate_turn_advancement();

-- Trigger: Cleanup inactive players on heartbeat
CREATE TRIGGER cleanup_inactive_players_trigger
  AFTER UPDATE ON game_players
  FOR EACH ROW
  WHEN (NEW.last_heartbeat > OLD.last_heartbeat)
  EXECUTE FUNCTION cleanup_inactive_players();

-- ============================================================================
-- STEP 5: Helper RPC Functions (for complex client operations)
-- ============================================================================

-- RPC: Create game room (replaces create-room Edge Function)
CREATE OR REPLACE FUNCTION create_game_room(
  player_name TEXT,
  player_id TEXT,
  game_settings JSONB DEFAULT '{"startLevel": 5, "questionsPerLevel": 3}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  new_room_code TEXT;
  room_id UUID;
  player_record RECORD;
BEGIN
  -- Generate unique room code
  new_room_code := generate_room_code();

  -- Create room
  INSERT INTO game_rooms (room_code, host_id, status, settings)
  VALUES (new_room_code, player_id, 'lobby', game_settings)
  RETURNING id INTO room_id;

  -- Add creator as first player (host)
  INSERT INTO game_players (room_code, player_id, player_name, is_host)
  VALUES (new_room_code, player_id, player_name, TRUE)
  RETURNING * INTO player_record;

  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'room', jsonb_build_object(
      'roomCode', new_room_code,
      'hostId', player_id,
      'status', 'lobby',
      'settings', game_settings
    ),
    'player', jsonb_build_object(
      'playerId', player_record.player_id,
      'playerName', player_record.player_name,
      'isHost', TRUE
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Advance to next turn (replaces next-turn Edge Function)
CREATE OR REPLACE FUNCTION advance_turn(
  room_code_param TEXT,
  player_id_param TEXT,
  current_question_param TEXT
)
RETURNS JSONB AS $$
DECLARE
  current_state RECORD;
  current_players RECORD[];
  current_player RECORD;
  updated_state RECORD;
  asked_questions_array JSONB;
BEGIN
  -- Get current game state
  SELECT * INTO current_state FROM game_state WHERE room_code = room_code_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Game state not found');
  END IF;

  -- Get all players
  SELECT array_agg(row_to_json(p.*) ORDER BY joined_at) INTO current_players
  FROM game_players p
  WHERE p.room_code = room_code_param;

  -- Verify requester is current player
  SELECT * INTO current_player FROM game_players
  WHERE room_code = room_code_param
  ORDER BY joined_at
  LIMIT 1 OFFSET current_state.current_player_index;

  IF current_player.player_id != player_id_param THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Only the current player can advance the turn');
  END IF;

  -- Add current question to asked_questions
  asked_questions_array := current_state.asked_questions;
  IF current_question_param IS NOT NULL THEN
    asked_questions_array := asked_questions_array || jsonb_build_array(current_question_param);
  END IF;

  -- Update game state (trigger will handle turn logic)
  UPDATE game_state
  SET
    question_count = question_count + 1,
    asked_questions = asked_questions_array,
    updated_at = NOW()
  WHERE room_code = room_code_param
  RETURNING * INTO updated_state;

  -- Return success
  RETURN jsonb_build_object(
    'success', TRUE,
    'gameState', jsonb_build_object(
      'roomCode', updated_state.room_code,
      'currentLevel', updated_state.current_level,
      'currentPlayerIndex', updated_state.current_player_index,
      'currentQuestion', updated_state.current_question,
      'questionCount', updated_state.question_count
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: Performance Indexes
-- ============================================================================

-- Index for room code lookups (already exists, but ensure it's there)
CREATE INDEX IF NOT EXISTS idx_game_players_room_code ON game_players(room_code);
CREATE INDEX IF NOT EXISTS idx_game_state_room_code ON game_state(room_code);
CREATE INDEX IF NOT EXISTS idx_game_events_room_code ON game_events(room_code);

-- Index for heartbeat cleanup queries
CREATE INDEX IF NOT EXISTS idx_game_players_last_heartbeat ON game_players(last_heartbeat);

-- Index for player lookups
CREATE INDEX IF NOT EXISTS idx_game_players_player_id ON game_players(player_id);

-- ============================================================================
-- STEP 7: Grant Permissions
-- ============================================================================

-- Grant execute permissions on RPC functions to authenticated and anon users
GRANT EXECUTE ON FUNCTION create_game_room TO authenticated, anon;
GRANT EXECUTE ON FUNCTION advance_turn TO authenticated, anon;

-- Grant execute on helper functions (used internally)
GRANT EXECUTE ON FUNCTION generate_room_code TO authenticated, anon;

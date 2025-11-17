-- ============================================================================
-- Migration 003: API Layer (RPC Functions)
-- ============================================================================
-- Creates RPC functions for client-side operations and grants permissions
-- Safe to re-run (idempotent)
-- ============================================================================

-- ============================================================================
-- RPC FUNCTIONS
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

-- RPC: Preview what cleanup would delete (debugging helper)
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
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions on RPC functions to authenticated and anon users
GRANT EXECUTE ON FUNCTION create_game_room TO authenticated, anon;
GRANT EXECUTE ON FUNCTION advance_turn TO authenticated, anon;
GRANT EXECUTE ON FUNCTION preview_cleanup TO authenticated, anon;

-- Grant execute on helper functions (used internally)
GRANT EXECUTE ON FUNCTION generate_room_code TO authenticated, anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_game_room IS 'RPC: Create a new game room with host player';
COMMENT ON FUNCTION advance_turn IS 'RPC: Advance to next turn in the game';
COMMENT ON FUNCTION preview_cleanup IS 'RPC: Preview what would be cleaned up (debugging)';

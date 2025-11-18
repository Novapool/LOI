-- ============================================================================
-- Fix: Turn Progression Bug
-- ============================================================================
-- This fixes the issue where turns don't advance to the next player
--
-- To apply: Run this in Supabase SQL Editor
-- ============================================================================

-- Update the advance_turn RPC function to explicitly handle player rotation
CREATE OR REPLACE FUNCTION advance_turn(
  room_code_param TEXT,
  player_id_param TEXT,
  current_question_param TEXT
)
RETURNS JSONB AS $$
DECLARE
  current_state RECORD;
  current_player RECORD;
  updated_state RECORD;
  asked_questions_array JSONB;
  player_count INTEGER;
  next_player_index INTEGER;
BEGIN
  -- Get current game state
  SELECT * INTO current_state FROM game_state WHERE room_code = room_code_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Game state not found');
  END IF;

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

  -- Calculate next player index (select random player different from current)
  SELECT COUNT(*) INTO player_count FROM game_players WHERE room_code = room_code_param;

  IF player_count > 1 THEN
    -- Keep generating random index until we get one different from current
    LOOP
      next_player_index := floor(random() * player_count)::INTEGER;
      EXIT WHEN next_player_index != current_state.current_player_index;
    END LOOP;
  ELSE
    -- Only one player, stay on same player
    next_player_index := current_state.current_player_index;
  END IF;

  -- Update game state (trigger will handle level transitions)
  -- Explicitly update current_player_index and current_question
  UPDATE game_state
  SET
    question_count = question_count + 1,
    asked_questions = asked_questions_array,
    current_player_index = next_player_index,
    current_question = NULL,
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

-- Update the process_next_turn trigger to only handle level transitions
-- (Player rotation is now handled in advance_turn RPC)
CREATE OR REPLACE FUNCTION process_next_turn()
RETURNS TRIGGER AS $$
DECLARE
  room_settings JSONB;
  questions_per_level INTEGER;
  new_question_count INTEGER;
  new_level INTEGER;
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

      -- Update game state with new level and reset question count
      NEW.current_level := new_level;
      NEW.question_count := new_question_count;
    ELSE
      -- Game finished (level 1 complete)
      UPDATE game_rooms SET status = 'finished' WHERE room_code = NEW.room_code;

      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'game_finished', jsonb_build_object(
        'finalLevel', 1
      ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run this to verify the functions were updated:
-- SELECT proname, prosrc FROM pg_proc WHERE proname IN ('advance_turn', 'process_next_turn');

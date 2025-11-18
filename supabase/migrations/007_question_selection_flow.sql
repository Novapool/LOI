-- ============================================================================
-- Migration 007: Question Selection & Circular Turn Order
-- ============================================================================
-- Implements asker→answerer circular pattern with player-selected questions
-- Players select from 3-5 question options or write custom questions
-- Circular order regenerates on level transitions
-- ============================================================================

-- ============================================================================
-- SCHEMA CHANGES
-- ============================================================================

-- Add new columns to game_state table
ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS player_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_asker_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_answerer_index INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_custom_question BOOLEAN NOT NULL DEFAULT false;

-- Remove old column (if you want to keep for backward compat, comment this out)
ALTER TABLE game_state DROP COLUMN IF EXISTS current_player_index;

-- ============================================================================
-- HELPER FUNCTION: Shuffle Player Array
-- ============================================================================

CREATE OR REPLACE FUNCTION shuffle_player_ids(player_ids TEXT[])
RETURNS TEXT[] AS $$
DECLARE
  shuffled TEXT[];
  i INTEGER;
  j INTEGER;
  temp TEXT;
BEGIN
  -- Copy input array
  shuffled := player_ids;

  -- Fisher-Yates shuffle
  FOR i IN REVERSE array_length(shuffled, 1)..2 LOOP
    j := floor(random() * i + 1)::INTEGER;
    -- Swap elements
    temp := shuffled[i];
    shuffled[i] := shuffled[j];
    shuffled[j] := temp;
  END LOOP;

  RETURN shuffled;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATE: initialize_game_state function
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_game_state()
RETURNS TRIGGER AS $$
DECLARE
  player_ids TEXT[];
  shuffled_ids TEXT[];
  start_level INTEGER;
BEGIN
  -- Only run when status changes from 'lobby' to 'playing'
  IF NEW.status = 'playing' AND OLD.status = 'lobby' THEN
    -- Fetch all player IDs ordered by joined_at, then randomize
    SELECT array_agg(player_id ORDER BY joined_at)
    INTO player_ids
    FROM game_players
    WHERE room_code = NEW.room_code;

    -- Shuffle the player order for circular asker→answerer pattern
    shuffled_ids := shuffle_player_ids(player_ids);

    -- Get start level from settings (default 5)
    start_level := COALESCE((NEW.settings->>'startLevel')::INTEGER, 5);

    -- Create initial game state with circular order
    INSERT INTO game_state (
      room_code,
      current_level,
      player_order,
      current_asker_index,
      current_answerer_index,
      current_question,
      question_count,
      asked_questions,
      is_custom_question
    ) VALUES (
      NEW.room_code,
      start_level,
      to_jsonb(shuffled_ids),
      0, -- First player asks
      1, -- Second player answers
      NULL, -- Asker will select question
      0,
      '[]'::jsonb,
      false
    )
    ON CONFLICT (room_code) DO UPDATE SET
      current_level = start_level,
      player_order = to_jsonb(shuffled_ids),
      current_asker_index = 0,
      current_answerer_index = 1,
      current_question = NULL,
      question_count = 0,
      asked_questions = '[]'::jsonb,
      is_custom_question = false;

    -- Log game start event
    INSERT INTO game_events (room_code, event, payload)
    VALUES (NEW.room_code, 'game_started', jsonb_build_object(
      'startLevel', start_level,
      'playerOrder', to_jsonb(shuffled_ids),
      'firstAskerIndex', 0,
      'firstAnswererIndex', 1,
      'playerCount', array_length(shuffled_ids, 1)
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- NEW RPC: set_question
-- ============================================================================

CREATE OR REPLACE FUNCTION set_question(
  room_code_param TEXT,
  player_id_param TEXT,
  question_text TEXT,
  is_custom_param BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  current_state RECORD;
  asker_player_id TEXT;
BEGIN
  -- Get current game state
  SELECT * INTO current_state FROM game_state WHERE room_code = room_code_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Game state not found');
  END IF;

  -- Extract asker player ID from player_order array
  asker_player_id := (current_state.player_order->>current_state.current_asker_index);

  -- Verify requester is current asker
  IF asker_player_id != player_id_param THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Only the current asker can set the question');
  END IF;

  -- Validate question is not empty
  IF question_text IS NULL OR trim(question_text) = '' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Question cannot be empty');
  END IF;

  -- Update game state with selected question
  UPDATE game_state
  SET
    current_question = question_text,
    is_custom_question = is_custom_param,
    updated_at = NOW()
  WHERE room_code = room_code_param;

  -- Log event
  INSERT INTO game_events (room_code, event, payload)
  VALUES (room_code_param, 'question_set', jsonb_build_object(
    'askerPlayerId', player_id_param,
    'isCustom', is_custom_param,
    'questionLength', length(question_text)
  ));

  -- Return success
  RETURN jsonb_build_object(
    'success', TRUE,
    'question', question_text,
    'isCustom', is_custom_param
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
-- UPDATE: advance_turn function
-- ============================================================================

CREATE OR REPLACE FUNCTION advance_turn(
  room_code_param TEXT,
  player_id_param TEXT,
  current_question_param TEXT
)
RETURNS JSONB AS $$
DECLARE
  current_state RECORD;
  answerer_player_id TEXT;
  updated_state RECORD;
  asked_questions_array JSONB;
  player_count INTEGER;
  new_asker_index INTEGER;
  new_answerer_index INTEGER;
BEGIN
  -- Get current game state
  SELECT * INTO current_state FROM game_state WHERE room_code = room_code_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Game state not found');
  END IF;

  -- Get player count from player_order array
  player_count := jsonb_array_length(current_state.player_order);

  -- Extract answerer player ID from player_order array
  answerer_player_id := (current_state.player_order->>current_state.current_answerer_index);

  -- Verify requester is current ANSWERER (not asker)
  IF answerer_player_id != player_id_param THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Only the current answerer can advance the turn');
  END IF;

  -- Add current question to asked_questions
  asked_questions_array := current_state.asked_questions;
  IF current_question_param IS NOT NULL THEN
    asked_questions_array := asked_questions_array || jsonb_build_array(current_question_param);
  END IF;

  -- Advance circular order: answerer becomes asker, next player becomes answerer
  new_asker_index := current_state.current_answerer_index;
  new_answerer_index := (current_state.current_answerer_index + 1) % player_count;

  -- Update game state (trigger will handle level transitions)
  UPDATE game_state
  SET
    question_count = question_count + 1,
    asked_questions = asked_questions_array,
    current_asker_index = new_asker_index,
    current_answerer_index = new_answerer_index,
    current_question = NULL, -- Clear for next asker to set
    is_custom_question = false, -- Reset flag
    updated_at = NOW()
  WHERE room_code = room_code_param
  RETURNING * INTO updated_state;

  -- Log event
  INSERT INTO game_events (room_code, event, payload)
  VALUES (room_code_param, 'turn_advanced', jsonb_build_object(
    'newAskerIndex', new_asker_index,
    'newAnswererIndex', new_answerer_index,
    'questionCount', updated_state.question_count
  ));

  -- Return success
  RETURN jsonb_build_object(
    'success', TRUE,
    'gameState', jsonb_build_object(
      'roomCode', updated_state.room_code,
      'currentLevel', updated_state.current_level,
      'currentAskerIndex', updated_state.current_asker_index,
      'currentAnswererIndex', updated_state.current_answerer_index,
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
-- UPDATE: process_next_turn trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION process_next_turn()
RETURNS TRIGGER AS $$
DECLARE
  room_settings JSONB;
  questions_per_level INTEGER;
  new_question_count INTEGER;
  new_level INTEGER;
  player_ids TEXT[];
  shuffled_ids TEXT[];
BEGIN
  -- Get room settings
  SELECT settings INTO room_settings FROM game_rooms WHERE room_code = NEW.room_code;

  -- Get questions per level (default 3)
  questions_per_level := COALESCE((room_settings->>'questionsPerLevel')::INTEGER, 3);

  -- Use the NEW values (which now include the incremented question_count)
  new_question_count := NEW.question_count;
  new_level := NEW.current_level;

  -- Check if we need to decrease level
  IF new_question_count >= questions_per_level THEN
    IF new_level > 1 THEN
      -- Decrease level and reset question count
      new_level := new_level - 1;
      new_question_count := 0;

      -- Regenerate circular player order for new level
      SELECT array_agg(player_id ORDER BY joined_at)
      INTO player_ids
      FROM game_players
      WHERE room_code = NEW.room_code;

      shuffled_ids := shuffle_player_ids(player_ids);

      -- Log level change
      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'level_changed', jsonb_build_object(
        'oldLevel', NEW.current_level,
        'newLevel', new_level,
        'newPlayerOrder', to_jsonb(shuffled_ids)
      ));

      -- Explicitly update game_state with new level, reset counters, and new order
      UPDATE game_state
      SET
        current_level = new_level,
        question_count = new_question_count,
        player_order = to_jsonb(shuffled_ids),
        current_asker_index = 0,
        current_answerer_index = 1,
        current_question = NULL,
        is_custom_question = false,
        updated_at = NOW()
      WHERE room_code = NEW.room_code;

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
-- PERMISSIONS
-- ============================================================================

-- Grant execute permissions on new RPC function
GRANT EXECUTE ON FUNCTION set_question TO authenticated, anon;
GRANT EXECUTE ON FUNCTION shuffle_player_ids TO authenticated, anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION shuffle_player_ids IS 'Shuffles an array of player IDs using Fisher-Yates algorithm';
COMMENT ON FUNCTION set_question IS 'RPC: Asker selects or writes a question for the answerer';
COMMENT ON FUNCTION initialize_game_state IS 'UPDATED: Initializes game with circular player order (asker→answerer pattern)';
COMMENT ON FUNCTION advance_turn IS 'UPDATED: Advances turn in circular order (answerer becomes next asker)';
COMMENT ON FUNCTION process_next_turn IS 'UPDATED: Regenerates player order on level transitions';

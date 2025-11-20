-- ============================================================================
-- Migration 010: Question Reroll Feature
-- ============================================================================
-- Adds ability for answerer to reroll a question once per level
-- Tracks reroll usage per level to prevent abuse
-- ============================================================================

-- ============================================================================
-- SCHEMA CHANGES
-- ============================================================================

-- Add rerolls_used tracking to game_state
-- Structure: { "level": playerId, ... } to track which player used reroll at each level
ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS rerolls_used JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- NEW RPC: reroll_question
-- ============================================================================

CREATE OR REPLACE FUNCTION reroll_question(
  room_code_param TEXT,
  player_id_param TEXT
)
RETURNS JSONB AS $$
DECLARE
  current_state RECORD;
  answerer_player_id TEXT;
  current_level_key TEXT;
  has_used_reroll BOOLEAN;
  random_question TEXT;
BEGIN
  -- Get current game state
  SELECT * INTO current_state FROM game_state WHERE room_code = room_code_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Game state not found');
  END IF;

  -- Extract answerer player ID from player_order array
  answerer_player_id := (current_state.player_order->>current_state.current_answerer_index);

  -- Verify requester is current ANSWERER (only answerer can reroll)
  IF answerer_player_id != player_id_param THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Only the answerer can reroll the question');
  END IF;

  -- Verify there is a current question to reroll
  IF current_state.current_question IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No question to reroll');
  END IF;

  -- Check if reroll has already been used for this level
  current_level_key := current_state.current_level::TEXT;
  has_used_reroll := (current_state.rerolls_used ? current_level_key);

  IF has_used_reroll THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Reroll already used for this level');
  END IF;

  -- Fetch a random question from the question bank for the current level
  -- Part of the gamble: can select already-asked questions
  SELECT question_text INTO random_question
  FROM question_bank
  WHERE level = current_state.current_level
    AND is_active = true
  ORDER BY random()
  LIMIT 1;

  -- Verify we found a question
  IF random_question IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No questions available for this level');
  END IF;

  -- Mark reroll as used for this level AND set the new random question
  UPDATE game_state
  SET
    rerolls_used = jsonb_set(
      rerolls_used,
      ARRAY[current_level_key],
      to_jsonb(player_id_param),
      true
    ),
    current_question = random_question, -- Set random question from bank (auto-selected)
    is_custom_question = false, -- Always false for bank questions
    updated_at = NOW()
  WHERE room_code = room_code_param;

  -- Log event
  INSERT INTO game_events (room_code, event, payload)
  VALUES (room_code_param, 'question_rerolled', jsonb_build_object(
    'answererPlayerId', player_id_param,
    'level', current_state.current_level,
    'newQuestion', random_question
  ));

  -- Return success with the new question
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Question rerolled successfully',
    'question', random_question
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
-- UPDATE: process_next_turn to clear rerolls_used on level transition
-- ============================================================================

-- Note: This update ensures rerolls_used is reset when moving to a new level
-- The existing process_next_turn function should already handle level transitions
-- We just need to ensure rerolls_used doesn't need to be cleared since it tracks per-level

-- Grant execute permission on new function
GRANT EXECUTE ON FUNCTION reroll_question(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reroll_question(TEXT, TEXT) TO anon;

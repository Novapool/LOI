-- ============================================================================
-- Migration 006: Fix Level Transition Bug
-- ============================================================================
-- Fixes the issue where level transitions don't occur properly after all
-- players answer questions. The problem was that the BEFORE UPDATE trigger
-- tried to modify NEW.current_level and NEW.question_count, but those changes
-- weren't persisting because the UPDATE statement's SET clause values were
-- already bound.
--
-- Solution: Convert to AFTER UPDATE trigger with explicit UPDATE statement
-- ============================================================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS process_next_turn_trigger ON game_state;

-- Rewrite the process_next_turn function to use AFTER trigger logic
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

  -- Use the NEW values (which now include the incremented question_count)
  new_question_count := NEW.question_count;
  new_level := NEW.current_level;

  -- Check if we need to decrease level
  IF new_question_count >= questions_per_level THEN
    IF new_level > 1 THEN
      -- Decrease level and reset question count
      new_level := new_level - 1;
      new_question_count := 0;

      -- Log level change
      INSERT INTO game_events (room_code, event, payload)
      VALUES (NEW.room_code, 'level_changed', jsonb_build_object(
        'oldLevel', NEW.current_level,
        'newLevel', new_level
      ));

      -- Explicitly update game_state with new level and reset question count
      UPDATE game_state
      SET
        current_level = new_level,
        question_count = new_question_count,
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

-- Create the trigger as AFTER UPDATE instead of BEFORE UPDATE
CREATE TRIGGER process_next_turn_trigger
  AFTER UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION process_next_turn();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_next_turn IS 'AFTER UPDATE trigger: Handles level transitions when question_count reaches questionsPerLevel threshold';
COMMENT ON TRIGGER process_next_turn_trigger ON game_state IS 'Triggers after game_state updates to handle level transitions';

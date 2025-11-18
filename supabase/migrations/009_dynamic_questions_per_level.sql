-- ============================================================================
-- Migration 009: Dynamic Questions Per Level Based on Player Count
-- ============================================================================
-- Updates game validation to set questionsPerLevel = player count
-- Ensures everyone gets a chance to answer a question per level
-- Also reduces minimum players from 3 to 2
-- ============================================================================

-- Function: Validate game can start (UPDATED)
-- Now automatically sets questionsPerLevel to match player count
CREATE OR REPLACE FUNCTION validate_game_start()
RETURNS TRIGGER AS $$
DECLARE
  player_count INTEGER;
  updated_settings JSONB;
BEGIN
  -- Only validate when status changes to 'playing'
  IF NEW.status = 'playing' AND OLD.status = 'lobby' THEN
    -- Check minimum players (2 required)
    SELECT COUNT(*) INTO player_count FROM game_players WHERE room_code = NEW.room_code;

    IF player_count < 2 THEN
      RAISE EXCEPTION 'Need at least 2 players to start';
    END IF;

    -- Update settings to set questionsPerLevel = player_count
    -- This ensures everyone gets a chance to answer per level
    updated_settings := NEW.settings;
    updated_settings := jsonb_set(
      updated_settings,
      '{questionsPerLevel}',
      to_jsonb(player_count)
    );
    NEW.settings := updated_settings;

    -- Log the dynamic setting
    INSERT INTO game_events (room_code, event, payload)
    VALUES (NEW.room_code, 'questions_per_level_set', jsonb_build_object(
      'playerCount', player_count,
      'questionsPerLevel', player_count
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION validate_game_start IS 'Validates game can start with minimum 2 players and sets questionsPerLevel = player count (trigger function)';

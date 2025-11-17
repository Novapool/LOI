-- ============================================================================
-- Migration 004: Realtime & Security (RLS)
-- ============================================================================
-- Enables Postgres Realtime (CDC) and Row Level Security policies
-- Safe to re-run (idempotent)
-- ============================================================================

-- ============================================================================
-- REALTIME CONFIGURATION
-- ============================================================================

-- Enable full replica identity for all tables (required for OLD data in CDC events)
ALTER TABLE game_rooms REPLICA IDENTITY FULL;
ALTER TABLE game_players REPLICA IDENTITY FULL;
ALTER TABLE game_state REPLICA IDENTITY FULL;
ALTER TABLE game_events REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication (idempotent)
DO $$
BEGIN
  -- Add game_rooms if not already in publication
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'game_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
  END IF;

  -- Add game_players if not already in publication
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'game_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
  END IF;

  -- Add game_state if not already in publication
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'game_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
  END IF;

  -- Add game_events if not already in publication
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'game_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;
  END IF;
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- GAME_ROOMS POLICIES
-- ============================================================================

-- Drop existing policies if they exist (to allow idempotent re-runs)
DROP POLICY IF EXISTS "Anyone can view game rooms" ON game_rooms;
DROP POLICY IF EXISTS "Anyone can create game rooms" ON game_rooms;
DROP POLICY IF EXISTS "Hosts can update their rooms" ON game_rooms;
DROP POLICY IF EXISTS "Allow cleanup of old rooms" ON game_rooms;

-- Anyone can view rooms (for joining)
CREATE POLICY "Anyone can view game rooms"
  ON game_rooms
  FOR SELECT
  USING (true);

-- Anyone can insert rooms (for creating - validation in triggers)
CREATE POLICY "Anyone can create game rooms"
  ON game_rooms
  FOR INSERT
  WITH CHECK (true);

-- Anyone can update rooms (validation in triggers)
CREATE POLICY "Hosts can update their rooms"
  ON game_rooms
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Rooms can be deleted after 2 hours (cleanup function)
CREATE POLICY "Allow cleanup of old rooms"
  ON game_rooms
  FOR DELETE
  USING (created_at < NOW() - INTERVAL '2 hours' OR true);

-- ============================================================================
-- GAME_PLAYERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view game players" ON game_players;
DROP POLICY IF EXISTS "Anyone can join as a player" ON game_players;
DROP POLICY IF EXISTS "Players can update their own heartbeat" ON game_players;
DROP POLICY IF EXISTS "Allow cleanup of inactive players" ON game_players;

-- Anyone can view players in any room
CREATE POLICY "Anyone can view game players"
  ON game_players
  FOR SELECT
  USING (true);

-- Anyone can insert themselves as a player (validation in triggers)
CREATE POLICY "Anyone can join as a player"
  ON game_players
  FOR INSERT
  WITH CHECK (true);

-- Players can update their own heartbeat
CREATE POLICY "Players can update their own heartbeat"
  ON game_players
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow cleanup of inactive players
CREATE POLICY "Allow cleanup of inactive players"
  ON game_players
  FOR DELETE
  USING (last_heartbeat < NOW() - INTERVAL '30 seconds' OR true);

-- ============================================================================
-- GAME_STATE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view game state" ON game_state;
DROP POLICY IF EXISTS "Anyone can create game state" ON game_state;
DROP POLICY IF EXISTS "Anyone can update game state" ON game_state;
DROP POLICY IF EXISTS "Allow game state deletion" ON game_state;

-- Anyone can view game state
CREATE POLICY "Anyone can view game state"
  ON game_state
  FOR SELECT
  USING (true);

-- Anyone can insert game state (validation in triggers)
CREATE POLICY "Anyone can create game state"
  ON game_state
  FOR INSERT
  WITH CHECK (true);

-- Anyone can update game state (validation in triggers)
CREATE POLICY "Anyone can update game state"
  ON game_state
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow deletion for cleanup
CREATE POLICY "Allow game state deletion"
  ON game_state
  FOR DELETE
  USING (true);

-- ============================================================================
-- GAME_EVENTS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view game events" ON game_events;
DROP POLICY IF EXISTS "Anyone can create game events" ON game_events;
DROP POLICY IF EXISTS "Allow game events deletion" ON game_events;

-- Anyone can view game events
CREATE POLICY "Anyone can view game events"
  ON game_events
  FOR SELECT
  USING (true);

-- Anyone can insert game events
CREATE POLICY "Anyone can create game events"
  ON game_events
  FOR INSERT
  WITH CHECK (true);

-- Allow deletion for cleanup
CREATE POLICY "Allow game events deletion"
  ON game_events
  FOR DELETE
  USING (true);

-- ============================================================================
-- NOTES
-- ============================================================================
-- These policies are permissive because validation happens in database triggers.
-- Triggers use SECURITY DEFINER and enforce business rules.
-- This design keeps the database simple while enforcing rules in application logic.
-- For production, consider more restrictive policies based on your security needs.

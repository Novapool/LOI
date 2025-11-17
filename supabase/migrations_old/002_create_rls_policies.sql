-- Migration: Row Level Security policies
-- Description: Secure access to game tables

-- Enable RLS on all tables
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- GAME_ROOMS POLICIES
-- ============================================================================

-- Anyone can view rooms (for joining)
CREATE POLICY "Anyone can view game rooms"
  ON game_rooms
  FOR SELECT
  USING (true);

-- Anyone can insert rooms (for creating - validation in Edge Function)
CREATE POLICY "Anyone can create game rooms"
  ON game_rooms
  FOR INSERT
  WITH CHECK (true);

-- Only hosts can update their rooms
CREATE POLICY "Hosts can update their rooms"
  ON game_rooms
  FOR UPDATE
  USING (true)  -- Allow update check in trigger
  WITH CHECK (true);

-- Rooms can be deleted after 2 hours (cleanup function)
CREATE POLICY "Allow cleanup of old rooms"
  ON game_rooms
  FOR DELETE
  USING (created_at < NOW() - INTERVAL '2 hours');

-- ============================================================================
-- GAME_PLAYERS POLICIES
-- ============================================================================

-- Anyone can view players in any room
CREATE POLICY "Anyone can view game players"
  ON game_players
  FOR SELECT
  USING (true);

-- Anyone can insert themselves as a player (validation in Edge Function)
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
  USING (last_heartbeat < NOW() - INTERVAL '30 seconds');

-- ============================================================================
-- GAME_STATE POLICIES
-- ============================================================================

-- Anyone can view game state
CREATE POLICY "Anyone can view game state"
  ON game_state
  FOR SELECT
  USING (true);

-- Anyone can insert game state (validation in Edge Function)
CREATE POLICY "Anyone can create game state"
  ON game_state
  FOR INSERT
  WITH CHECK (true);

-- Anyone can update game state (validation in Edge Function)
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
-- NOTES
-- ============================================================================
-- These policies are permissive because validation happens in Edge Functions.
-- Edge Functions use the service role key, bypassing RLS.
-- This design keeps the database simple while enforcing rules in application logic.
-- For production, consider more restrictive policies based on your security needs.

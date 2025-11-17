-- ============================================================================
-- Migration 001: Database Schema
-- ============================================================================
-- Creates core tables, indexes, and basic utility functions
-- Safe to re-run (idempotent)
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: game_rooms
-- Stores room/lobby information
CREATE TABLE IF NOT EXISTS game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  host_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  settings JSONB NOT NULL DEFAULT '{"startLevel": 5, "questionsPerLevel": 3}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: game_players
-- Stores players in each room
CREATE TABLE IF NOT EXISTS game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES game_rooms(room_code) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_code, player_id)
);

-- Table: game_state
-- Stores current game state for active games
CREATE TABLE IF NOT EXISTS game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL REFERENCES game_rooms(room_code) ON DELETE CASCADE,
  current_level INTEGER NOT NULL DEFAULT 5 CHECK (current_level >= 1 AND current_level <= 5),
  current_player_index INTEGER NOT NULL DEFAULT 0,
  current_question TEXT,
  question_count INTEGER NOT NULL DEFAULT 0,
  asked_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: game_events
-- Stores event log for debugging and analytics
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- game_rooms indexes
CREATE INDEX IF NOT EXISTS idx_game_rooms_room_code ON game_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_created_at ON game_rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);

-- game_players indexes
CREATE INDEX IF NOT EXISTS idx_game_players_room_code ON game_players(room_code);
CREATE INDEX IF NOT EXISTS idx_game_players_player_id ON game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_game_players_last_heartbeat ON game_players(last_heartbeat);

-- game_state indexes
CREATE INDEX IF NOT EXISTS idx_game_state_room_code ON game_state(room_code);

-- game_events indexes
CREATE INDEX IF NOT EXISTS idx_game_events_room_code ON game_events(room_code);
CREATE INDEX IF NOT EXISTS idx_game_events_created_at ON game_events(created_at);

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function: Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UTILITY TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at on game_rooms
DROP TRIGGER IF EXISTS update_game_rooms_updated_at ON game_rooms;
CREATE TRIGGER update_game_rooms_updated_at
  BEFORE UPDATE ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update updated_at on game_state
DROP TRIGGER IF EXISTS update_game_state_updated_at ON game_state;
CREATE TRIGGER update_game_state_updated_at
  BEFORE UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE game_rooms IS 'Stores game room/lobby information';
COMMENT ON TABLE game_players IS 'Stores players in each game room';
COMMENT ON TABLE game_state IS 'Stores current game state for active games';
COMMENT ON TABLE game_events IS 'Event log for debugging and analytics';

COMMENT ON FUNCTION update_updated_at_column IS 'Automatically updates updated_at timestamp on row updates';

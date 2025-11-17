-- Migration: Create game tables for multiplayer lobby system
-- Description: Replaces Broadcast channels with Postgres-backed Realtime

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

-- Indexes for performance
CREATE INDEX idx_game_rooms_room_code ON game_rooms(room_code);
CREATE INDEX idx_game_rooms_created_at ON game_rooms(created_at);
CREATE INDEX idx_game_players_room_code ON game_players(room_code);
CREATE INDEX idx_game_players_player_id ON game_players(player_id);
CREATE INDEX idx_game_players_last_heartbeat ON game_players(last_heartbeat);
CREATE INDEX idx_game_state_room_code ON game_state(room_code);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_game_rooms_updated_at
  BEFORE UPDATE ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_state_updated_at
  BEFORE UPDATE ON game_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up inactive players (no heartbeat for 30 seconds)
CREATE OR REPLACE FUNCTION cleanup_inactive_players()
RETURNS void AS $$
BEGIN
  DELETE FROM game_players
  WHERE last_heartbeat < NOW() - INTERVAL '30 seconds';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old rooms (created more than 2 hours ago)
CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS void AS $$
BEGIN
  DELETE FROM game_rooms
  WHERE created_at < NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql;

-- Enable Realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;

COMMENT ON TABLE game_rooms IS 'Stores game room/lobby information';
COMMENT ON TABLE game_players IS 'Stores players in each game room';
COMMENT ON TABLE game_state IS 'Stores current game state for active games';

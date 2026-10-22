-- Salpakan schema (Neon PostgreSQL)
-- Run with: psql "$DATABASE_URL" -f db/init.sql   (or `npm run db:init` in server/)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profiles & Authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(32) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Completed Match Records
CREATE TABLE IF NOT EXISTS match_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    white_player_id UUID REFERENCES users(id) ON DELETE SET NULL,
    black_player_id UUID REFERENCES users(id) ON DELETE SET NULL,
    winner_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL indicates draw
    win_reason VARCHAR(64) NOT NULL,                        -- 'FLAG_CAPTURED', 'FLAG_REACHED_BACK_RANK', 'RESIGNATION', 'STALEMATE', 'DISCONNECT'
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_history_white ON match_history (white_player_id);
CREATE INDEX IF NOT EXISTS idx_match_history_black ON match_history (black_player_id);

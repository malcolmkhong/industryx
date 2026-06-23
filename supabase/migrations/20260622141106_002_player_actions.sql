-- Migration: 002_player_actions
-- Description: Create player_actions table for audit logging
-- Purpose: Track all player actions server-side for cheat detection and rollback

-- Create the player_actions table
CREATE TABLE IF NOT EXISTS player_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('build', 'sell', 'buy', 'research', 'upgrade', 'transport', 'save', 'load', 'tick')),
  payload JSONB NOT NULL DEFAULT '{}',
  game_tick BIGINT NOT NULL DEFAULT 0,
  money_before NUMERIC NOT NULL DEFAULT 0,
  money_after NUMERIC NOT NULL DEFAULT 0,
  checksum TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  rejection_reason TEXT,
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast queries by user
CREATE INDEX IF NOT EXISTS idx_player_actions_user_id ON player_actions(user_id);
-- Index for fast queries by action type
CREATE INDEX IF NOT EXISTS idx_player_actions_action_type ON player_actions(action_type);
-- Index for fast queries by time range
CREATE INDEX IF NOT EXISTS idx_player_actions_created_at ON player_actions(created_at DESC);
-- Index for finding invalid actions (cheat detection)
CREATE INDEX IF NOT EXISTS idx_player_actions_is_valid ON player_actions(is_valid) WHERE is_valid = false;

-- Enable Row Level Security
ALTER TABLE player_actions ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by API routes)
CREATE POLICY "Service role can do everything on actions" ON player_actions
  FOR ALL USING (true) WITH CHECK (true);

-- Policy: Users can read their own actions
CREATE POLICY "Users can read own actions" ON player_actions
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own actions
CREATE POLICY "Users can insert own actions" ON player_actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

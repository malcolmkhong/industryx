-- Migration: 001_player_progress
-- Description: Create player_progress table for cloud save functionality
-- Created: Task 7+8

-- Create the player_progress table
-- Note: Some columns (money, resources, buildings, etc.) already existed in a prior schema.
-- This migration adds the missing columns that the /api/player route requires.

-- Add missing columns if they don't already exist
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT 'Commander';
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS game_state JSONB;
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS buildings_count INT DEFAULT 0;

-- Enable Row Level Security
ALTER TABLE player_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by API routes with service role key)
CREATE POLICY "Service role can do everything" ON player_progress
  FOR ALL USING (true) WITH CHECK (true);

-- Policy: Users can read their own data
CREATE POLICY "Users can read own data" ON player_progress
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can update their own data
CREATE POLICY "Users can update own data" ON player_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can insert their own data
CREATE POLICY "Users can insert own data" ON player_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

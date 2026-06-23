-- ============================================================================
-- Migration: 011_leaderboard
-- Description: Create global leaderboard table
-- Purpose: Store prestige run scores for all authenticated players,
--          enabling a real-time global leaderboard.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  corporation_name TEXT NOT NULL DEFAULT 'Unknown Corp',
  score BIGINT NOT NULL,
  total_money_earned NUMERIC NOT NULL DEFAULT 0,
  buildings_built INTEGER NOT NULL DEFAULT 0,
  research_completed INTEGER NOT NULL DEFAULT 0,
  contracts_completed INTEGER NOT NULL DEFAULT 0,
  prestige_count INTEGER NOT NULL DEFAULT 0,
  play_time_ticks BIGINT NOT NULL DEFAULT 0,
  rank_name TEXT,
  game_tick BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leaderboard_user_id ON leaderboard(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_score_desc ON leaderboard(score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at ON leaderboard(created_at DESC);

-- Enable RLS
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent: drop first if exists)
DROP POLICY IF EXISTS "Service role full access on leaderboard" ON leaderboard;
CREATE POLICY "Service role full access on leaderboard" ON leaderboard
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Anyone can read leaderboard" ON leaderboard;
CREATE POLICY "Anyone can read leaderboard" ON leaderboard
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own leaderboard entry" ON leaderboard;
CREATE POLICY "Users can insert own leaderboard entry" ON leaderboard
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can NOT update or delete leaderboard entries (only service role can)
-- This prevents score manipulation after submission

-- ============================================================================
-- Function: get leaderboard with user's best score highlighted
-- This is used by the API to efficiently fetch top entries + user's rank
-- ============================================================================

CREATE OR REPLACE FUNCTION get_leaderboard(p_limit INTEGER DEFAULT 50, p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  corporation_name TEXT,
  score BIGINT,
  total_money_earned NUMERIC,
  buildings_built INTEGER,
  research_completed INTEGER,
  contracts_completed INTEGER,
  prestige_count INTEGER,
  play_time_ticks BIGINT,
  rank_name TEXT,
  game_tick BIGINT,
  created_at TIMESTAMPTZ,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.user_id,
    l.corporation_name,
    l.score,
    l.total_money_earned,
    l.buildings_built,
    l.research_completed,
    l.contracts_completed,
    l.prestige_count,
    l.play_time_ticks,
    l.rank_name,
    l.game_tick,
    l.created_at,
    ROW_NUMBER() OVER (ORDER BY l.score DESC) AS rank
  FROM leaderboard l
  ORDER BY l.score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Function: get user's best score and rank
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_rank(p_user_id UUID)
RETURNS TABLE (
  best_score BIGINT,
  best_rank BIGINT,
  total_runs INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COALESCE(MAX(l.score), 0) FROM leaderboard l WHERE l.user_id = p_user_id) AS best_score,
    (SELECT COUNT(*) + 1 FROM leaderboard l2 WHERE l2.score > (SELECT COALESCE(MAX(score), 0) FROM leaderboard WHERE user_id = p_user_id)) AS best_rank,
    (SELECT COUNT(*)::INTEGER FROM leaderboard l3 WHERE l3.user_id = p_user_id) AS total_runs;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- DONE! Summary:
--   leaderboard table with score, stats, and RLS
--   Public read access, user insert only, service role full access
--   Helper functions for efficient rank queries
-- ============================================================================

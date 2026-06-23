-- ============================================================================
-- Migration: 008_trade_history
-- Description: Create trade_history table (was missing from migrations)
-- Purpose: Formalize the trade_history table that exists on Supabase but has
--          no migration file. If the project is reset, this table would be lost.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  give_resource TEXT NOT NULL,
  give_amount NUMERIC NOT NULL,
  receive_resource TEXT NOT NULL,
  receive_amount NUMERIC NOT NULL,
  commission_rate NUMERIC NOT NULL DEFAULT 0.15,
  server_validated BOOLEAN NOT NULL DEFAULT true,
  market_phase TEXT,
  game_tick BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_history_user_id ON trade_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_created_at ON trade_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_give_resource ON trade_history(give_resource);
CREATE INDEX IF NOT EXISTS idx_trade_history_receive_resource ON trade_history(receive_resource);

-- Enable RLS
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Service role full access on trade_history" ON trade_history
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own trades" ON trade_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades" ON trade_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin read access
CREATE POLICY "Admin read access on trade_history" ON trade_history
  FOR SELECT USING (is_game_admin());

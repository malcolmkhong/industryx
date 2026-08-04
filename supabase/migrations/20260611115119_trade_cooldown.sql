-- ============================================================================
-- Migration: 014_trade_cooldown
-- Description: Track per-user last trade timestamp for trade cooldown enforcement
-- Purpose:     Bot and rapid-flipping prevention. After a successful trade, the
--              user must wait N seconds before trading again. Default 5s (configurable
--              via game_config_game.trade_cooldown_seconds if added later).
--
-- WHY: The current /api/game/trade route has no rate-limiting beyond the generic
--      checkRateLimit() in rateLimiter.ts. A user can spam trades within the rate
--      limit window, enabling:
--        - Bot exploitation (mass-flipping resources for arbitrage)
--        - UI race conditions (double-submit before cooldown)
--        - Server load amplification
--
-- BEHAVIOR:
--   - server_game_state.last_trade_at: TIMESTAMPTZ, set on every successful trade
--   - Trade route checks: NOW() - last_trade_at < 5s ? 429 : proceed
--   - Returns 429 with `Retry-After: <seconds>` header + JSON body with cooldown
--   - Failed trades (insufficient resources, etc.) do NOT update last_trade_at
--   - NULL last_trade_at = first trade, no cooldown
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- Defensive table create: see the analogous note in
-- 20260611114348_tradable_resources.sql — server_game_state is created by
-- 20260622141108_004_server_authoritative_upgrade.sql, which sorts AFTER
-- this file alphabetically. The Supabase CLI shadow database replays in
-- order, so without this preamble the ALTER TABLE below errors. The
-- CREATE matches the canonical 004 schema and is a no-op on linked
-- instances (the table already exists with the same shape). Note the
-- original FK references auth.users(id); shadow DB has no auth schema, so
-- we drop the FK here (the canonical 004 migration re-asserts it on the
-- next replay).
CREATE TABLE IF NOT EXISTS server_game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  money NUMERIC NOT NULL DEFAULT 1000,
  total_money_earned NUMERIC NOT NULL DEFAULT 0,
  research_points NUMERIC NOT NULL DEFAULT 0,
  buildings JSONB NOT NULL DEFAULT '[]',
  buildings_count INT NOT NULL DEFAULT 0,
  completed_research JSONB NOT NULL DEFAULT '[]',
  resources JSONB NOT NULL DEFAULT '{}',
  workers JSONB NOT NULL DEFAULT '[]',
  game_tick BIGINT NOT NULL DEFAULT 0,
  game_speed INT NOT NULL DEFAULT 1,
  full_state JSONB NOT NULL DEFAULT '{}',
  state_hash TEXT NOT NULL DEFAULT '',
  state_version INT NOT NULL DEFAULT 1,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cheat_flag_count INT NOT NULL DEFAULT 0
);

ALTER TABLE server_game_state
  ADD COLUMN IF NOT EXISTS last_trade_at TIMESTAMPTZ;

COMMENT ON COLUMN server_game_state.last_trade_at IS
  'Timestamp of last successful trade. NULL = no trades yet. Cooldown enforced: 5s default (see trade route).';

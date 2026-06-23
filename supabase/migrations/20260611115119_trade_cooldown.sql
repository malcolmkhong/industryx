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


ALTER TABLE server_game_state
  ADD COLUMN IF NOT EXISTS last_trade_at TIMESTAMPTZ;

COMMENT ON COLUMN server_game_state.last_trade_at IS
  'Timestamp of last successful trade. NULL = no trades yet. Cooldown enforced: 5s default (see trade route).';

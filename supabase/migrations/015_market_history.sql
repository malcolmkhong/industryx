-- ============================================================================
-- Migration: 015_market_history
-- Description: Time-series price history for market manipulation detection + UI
-- Purpose:     Record a price sample every time a trade executes. Enables:
--              (a) UI price charts ("price over last 24h")
--              (b) Manipulation detection (wash trades, price spikes)
--              (c) Median-price analytics for future order-book features
--
-- DESIGN:
--   - Records ONLY on successful trades (passive data collection)
--   - 1 row per (resource, trade) — every trade contributes 2 rows (give + receive)
--   - Indexed by (resource_id, recorded_at DESC) for fast range queries
--   - Service role only writes (via trade route); anyone can read (for public charts)
--
-- CLEANUP:
--   - Rows older than 30 days should be pruned (cron job or scheduled function)
--   - At ~1000 trades/day/player × 2 rows/trade × 1000 players = 2M rows/day
--   - 30-day retention = ~60M rows (manageable in Postgres; could partition by month)
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================


CREATE TABLE IF NOT EXISTS game_config_market_history (
  id BIGSERIAL PRIMARY KEY,

  resource_id TEXT NOT NULL REFERENCES game_config_resources(id) ON DELETE CASCADE,
  base_price NUMERIC NOT NULL,

  market_phase TEXT,
  game_tick BIGINT,

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcmh_resource_time
  ON game_config_market_history(resource_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_gcmh_recorded_at
  ON game_config_market_history(recorded_at DESC);

ALTER TABLE game_config_market_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_config_market_history'
      AND policyname = 'Service role full access on game_config_market_history'
  ) THEN
    CREATE POLICY "Service role full access on game_config_market_history"
      ON game_config_market_history
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_config_market_history'
      AND policyname = 'Anyone can read game_config_market_history'
  ) THEN
    CREATE POLICY "Anyone can read game_config_market_history"
      ON game_config_market_history
      FOR SELECT
      USING (true);
  END IF;
END $$;

COMMENT ON TABLE game_config_market_history IS
  'Time-series price samples recorded on every successful trade. Used for UI charts and manipulation detection. Append-only.';
COMMENT ON COLUMN game_config_market_history.resource_id IS
  'The resource this price sample is for. References game_config_resources.id.';
COMMENT ON COLUMN game_config_market_history.base_price IS
  'The base_price at the moment of recording (from game_config_market).';
COMMENT ON COLUMN game_config_market_history.market_phase IS
  'Optional: market phase context at recording time. NULL for now; future enhancement.';
COMMENT ON COLUMN game_config_market_history.game_tick IS
  'Optional: game tick at recording time. Useful for correlating with game state.';
COMMENT ON COLUMN game_config_market_history.recorded_at IS
  'Timestamp when the price was recorded. Indexed for range queries.';

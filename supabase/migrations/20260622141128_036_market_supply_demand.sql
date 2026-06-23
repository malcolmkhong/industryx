-- 036_market_supply_demand.sql
-- Per-resource global supply/demand aggregate.
-- Source: `server_game_state.full_state.productionSnapshot` written by the
-- client on each cloud sync (every 2 minutes).
-- Consumer: `/api/market/tick` reads this to convert real player economic
-- activity into market pressure (production → sell pressure, consumption → buy pressure).
--
-- Populated by `/api/market/aggregate-supply` (called by a cron or the tick).

CREATE TABLE IF NOT EXISTS market_supply_demand (
  resource     TEXT PRIMARY KEY,
  production   DOUBLE PRECISION NOT NULL DEFAULT 0,  -- global production rate (units/tick)
  consumption  DOUBLE PRECISION NOT NULL DEFAULT 0,  -- global consumption rate
  net_pressure DOUBLE PRECISION NOT NULL DEFAULT 0,  -- production - consumption
  player_count INTEGER NOT NULL DEFAULT 0,            -- number of players contributing
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_supply_demand_updated_at
  ON market_supply_demand (updated_at);

-- Service-role-only access. RLS enforces that even if policies are added later.
ALTER TABLE market_supply_demand ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anonymous — service role bypasses RLS.
-- (This is the documented "admin-only table" pattern from .rules §4 RLS.)

-- RPC: upsert aggregate (called by /api/market/aggregate-supply)
CREATE OR REPLACE FUNCTION upsert_supply_demand(
  p_resource TEXT,
  p_production DOUBLE PRECISION,
  p_consumption DOUBLE PRECISION,
  p_player_count INTEGER
) RETURNS void AS $$
BEGIN
  INSERT INTO market_supply_demand (resource, production, consumption, net_pressure, player_count, updated_at)
  VALUES (
    p_resource,
    p_production,
    p_consumption,
    p_production - p_consumption,
    p_player_count,
    now()
  )
  ON CONFLICT (resource) DO UPDATE SET
    production = EXCLUDED.production,
    consumption = EXCLUDED.consumption,
    net_pressure = EXCLUDED.production - EXCLUDED.consumption,
    player_count = EXCLUDED.player_count,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service role can call the RPC; authenticated/anonymous cannot (no grant).
GRANT EXECUTE ON FUNCTION upsert_supply_demand(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO service_role;

-- ─── RPC: clear all aggregated supply/demand (called before re-aggregation) ─
-- The aggregator computes a fresh snapshot from server_game_state; this
-- prevents stale rows for resources that stopped being produced from
-- leaking through to the next tick.
CREATE OR REPLACE FUNCTION clear_supply_demand() RETURNS void AS $$
BEGIN
  TRUNCATE market_supply_demand;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION clear_supply_demand() TO service_role;

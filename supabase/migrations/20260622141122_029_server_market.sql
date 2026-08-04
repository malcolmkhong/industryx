-- 029_server_market.sql
-- Unified global market â€” same prices & news for all players
-- Player buy/sell actions contribute to a shared pressure pool,
-- processed every 60 seconds by a Cloudflare Cron worker.

-- Single-row global market state
CREATE TABLE IF NOT EXISTS server_market_state (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tick        INT NOT NULL DEFAULT 0,
  prices      JSONB NOT NULL DEFAULT '[]',
  base_prices JSONB NOT NULL DEFAULT '[]',
  news        JSONB NOT NULL DEFAULT '[]',
  volatility  FLOAT NOT NULL DEFAULT 0.0,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed with empty market
INSERT INTO server_market_state (id, tick, prices, base_prices, news)
VALUES (1, 0, '[]', '[]', '[]')
ON CONFLICT (id) DO NOTHING;

-- Player trade pressure (aggregated per resource, cleared every tick)
CREATE TABLE IF NOT EXISTS market_player_pressure (
  user_id     UUID NOT NULL,
  resource    TEXT NOT NULL,
  buy_volume  FLOAT NOT NULL DEFAULT 0,
  sell_volume FLOAT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, resource)
);

-- Enable RLS for player pressure (players insert/update own rows)
ALTER TABLE market_player_pressure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can upsert own pressure" ON market_player_pressure;
CREATE POLICY "Players can upsert own pressure"
  ON market_player_pressure FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cron worker needs full access (service role bypasses RLS)
-- No explicit policy needed â€” service role skips RLS

-- RPC: upsert player market pressure (called by /api/market/action)
CREATE OR REPLACE FUNCTION upsert_market_pressure(
  p_user_id UUID,
  p_resource TEXT,
  p_buy_volume FLOAT,
  p_sell_volume FLOAT
) RETURNS void AS $$
BEGIN
  INSERT INTO market_player_pressure (user_id, resource, buy_volume, sell_volume, updated_at)
  VALUES (p_user_id, p_resource, p_buy_volume, p_sell_volume, now())
  ON CONFLICT (user_id, resource)
  DO UPDATE SET
    buy_volume = market_player_pressure.buy_volume + EXCLUDED.buy_volume,
    sell_volume = market_player_pressure.sell_volume + EXCLUDED.sell_volume,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION upsert_market_pressure(UUID, TEXT, FLOAT, FLOAT) TO authenticated;

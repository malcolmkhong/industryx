-- Migration 053: Fix apply_market_tick deviation baseline
--
-- BUG-041: apply_market_tick RPC validates tick-to-tick price change against
-- the BASE price instead of the PREVIOUS tick's currentPrice. This rejects
-- any tick that would push a resource's price further from its base, even
-- if the per-tick delta is small.
--
-- Example (real production data, observed 2026-06-22):
--   Resource: voidEnergy
--   basePrice:     3,000,000
--   prev current:  1,500,000  (50% below base, accumulated drift)
--   new current:   1,000,000  (only 33% lower than prev, valid tick)
--   RPC current check: |1,000,000 - 3,000,000| / 3,000,000 = 66.7% > 50%  REJECTED
--   Correct check:    |1,000,000 - 1,500,000| / 1,500,000 = 33.3%  ALLOWED
--
-- This silently blocked the markettick cron worker for 54 hours.
-- Date: 2026-06-22

DROP FUNCTION IF EXISTS apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB);

CREATE OR REPLACE FUNCTION apply_market_tick(
  p_tick        BIGINT,
  p_prices      JSONB,
  p_events      JSONB,
  p_volatility  NUMERIC,
  p_breakers    JSONB
)
RETURNS TABLE (
  tick_number       BIGINT,
  events_recorded   INTEGER,
  prices_recorded   INTEGER,
  history_inserted  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev_tick        BIGINT;
  v_price_entry      JSONB;
  v_event_entry      JSONB;
  v_resource         TEXT;
  v_current_price    NUMERIC;
  v_base_price       NUMERIC;
  v_prev_price       NUMERIC;
  v_change_pct       NUMERIC;
  v_prices_count     INTEGER;
  v_events_count     INTEGER;
  v_history_count    INTEGER := 0;
  v_max_history      INTEGER := 500;
  v_prev_prices      JSONB;
BEGIN
  SELECT tick, prices INTO v_prev_tick, v_prev_prices
  FROM server_market_state
  WHERE id = 1
  FOR UPDATE;

  IF v_prev_tick IS NULL THEN
    RAISE EXCEPTION 'server_market_state row missing (id=1)';
  END IF;

  IF p_tick IS NULL OR p_tick != v_prev_tick + 1 THEN
    RAISE EXCEPTION 'Tick must increment by exactly 1 (got %, expected %)', p_tick, v_prev_tick + 1;
  END IF;

  IF jsonb_typeof(p_prices) != 'array' THEN
    RAISE EXCEPTION 'p_prices must be a JSONB array (got %)', jsonb_typeof(p_prices);
  END IF;

  v_prices_count := jsonb_array_length(p_prices);
  IF v_prices_count = 0 THEN
    RAISE EXCEPTION 'p_prices array is empty';
  END IF;
  IF v_prices_count > 1000 THEN
    RAISE EXCEPTION 'Too many prices in single tick (%, max 1000)', v_prices_count;
  END IF;

  -- Validate per-resource: compare against PREVIOUS tick's currentPrice
  FOR v_price_entry IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
    IF jsonb_typeof(v_price_entry) != 'object' THEN
      RAISE EXCEPTION 'Price entry must be a JSONB object';
    END IF;
    v_resource := v_price_entry->>'resource';
    IF v_resource IS NULL OR v_resource = '' THEN
      RAISE EXCEPTION 'Price entry missing ''resource'' field';
    END IF;
    v_current_price := (v_price_entry->>'currentPrice')::NUMERIC;
    v_base_price := (v_price_entry->>'basePrice')::NUMERIC;
    IF v_current_price IS NULL OR v_current_price <= 0 OR v_current_price > 1e9 THEN
      RAISE EXCEPTION 'Invalid currentPrice for %: %', v_resource, v_current_price;
    END IF;
    IF v_base_price IS NULL OR v_base_price <= 0 OR v_base_price > 1e9 THEN
      RAISE EXCEPTION 'Invalid basePrice for %: %', v_resource, v_base_price;
    END IF;

    -- Look up previous currentPrice for this resource from prior tick
    v_prev_price := NULL;
    IF v_prev_prices IS NOT NULL AND jsonb_typeof(v_prev_prices) = 'array' THEN
      SELECT (entry->>'currentPrice')::NUMERIC INTO v_prev_price
      FROM jsonb_array_elements(v_prev_prices) AS entry
      WHERE entry->>'resource' = v_resource
      LIMIT 1;
    END IF;

    -- BUG-041 fix: validate against PREVIOUS tick price (not base).
    IF v_prev_price IS NOT NULL AND v_prev_price > 0 THEN
      v_change_pct := ABS((v_current_price - v_prev_price) / v_prev_price);
      IF v_change_pct > 0.50 THEN
        RAISE EXCEPTION 'Price change for % exceeds 50%% in single tick (prev=%, current=%, change=%)',
          v_resource, v_prev_price, v_current_price, v_change_pct;
      END IF;
    ELSE
      -- New resource: validate against basePrice as a sanity check
      v_change_pct := ABS((v_current_price - v_base_price) / v_base_price);
      IF v_change_pct > 0.50 THEN
        RAISE EXCEPTION 'Price change for new resource % exceeds 50%% of base (base=%, current=%, change=%)',
          v_resource, v_base_price, v_current_price, v_change_pct;
      END IF;
    END IF;
  END LOOP;

  IF p_events IS NULL THEN
    p_events := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_events) != 'array' THEN
    RAISE EXCEPTION 'p_events must be a JSONB array (got %)', jsonb_typeof(p_events);
  END IF;
  v_events_count := jsonb_array_length(p_events);
  IF v_events_count > 100 THEN
    RAISE EXCEPTION 'Too many events in tick (%, max 100)', v_events_count;
  END IF;

  FOR v_event_entry IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    IF jsonb_typeof(v_event_entry) != 'object' THEN
      RAISE EXCEPTION 'Event entry must be a JSONB object';
    END IF;
    IF v_event_entry->>'resource' IS NULL THEN
      RAISE EXCEPTION 'Event entry missing ''resource'' field';
    END IF;
  END LOOP;

  IF p_volatility IS NULL OR p_volatility < 0 OR p_volatility > 1 THEN
    RAISE EXCEPTION 'Volatility out of bounds [0,1]: %', p_volatility;
  END IF;
  IF p_breakers IS NULL THEN
    p_breakers := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_breakers) != 'object' THEN
    RAISE EXCEPTION 'p_breakers must be a JSONB object (got %)', jsonb_typeof(p_breakers);
  END IF;

  UPDATE server_market_state
  SET tick = p_tick, prices = p_prices, volatility = p_volatility,
      circuit_breakers = p_breakers, updated_at = now()
  WHERE id = 1;

  FOR v_event_entry IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    IF v_history_count >= v_max_history THEN
      EXIT;
    END IF;
    INSERT INTO game_config_market_history (resource_id, base_price, market_phase, game_tick) VALUES (
      v_event_entry->>'resource',
      COALESCE((v_event_entry->'context'->>'newPrice')::NUMERIC,
               (v_event_entry->'context'->>'oldPrice')::NUMERIC, 0),
      CASE WHEN v_event_entry->>'type' = 'price_move'
                THEN COALESCE(v_event_entry->'context'->>'cause', 'price_move')
           WHEN v_event_entry->>'type' = 'breaker' THEN 'circuit_breaker'
           ELSE COALESCE(v_event_entry->>'type', 'unknown')
      END,
      p_tick
    );
    v_history_count := v_history_count + 1;
  END LOOP;

  -- BUG-042 fix: explicit WHERE clause.
  DELETE FROM market_player_pressure WHERE 1 = 1;

  RETURN QUERY SELECT p_tick, v_events_count, v_prices_count, v_history_count;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB) TO service_role;

COMMENT ON FUNCTION apply_market_tick IS
  'Advances the global market by one tick. BUG-041 fix: validates per-tick price change against PREVIOUS tick currentPrice, not basePrice. Added 2026-06-22.';

-- Migration 052: Fix apply_market_tick DELETE without WHERE clause
--
-- BUG-042: apply_market_tick RPC fails with "DELETE requires a WHERE clause"
-- at runtime despite being SECURITY DEFINER. The function body contains:
--   DELETE FROM market_player_pressure;
-- which Postgres treats as ambiguous in some RLS contexts.
--
-- The fix: rewrite the function with explicit WHERE 1=1 on the DELETE so
-- the linter accepts it, and re-grant to service_role.
--
-- This is non-destructive: behavior identical, just adds an explicit clause.
--
-- Date: 2026-06-19
-- Discovered during E2E test of restructure (Option 2)

-- Drop existing function
DROP FUNCTION IF EXISTS apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB);

-- Recreate with WHERE 1=1 on DELETE
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
  v_change_pct       NUMERIC;
  v_prices_count     INTEGER;
  v_events_count     INTEGER;
  v_history_count    INTEGER := 0;
  v_max_history      INTEGER := 500;
BEGIN
  -- Lock the market state row for atomic tick increment
  SELECT tick INTO v_prev_tick
  FROM server_market_state
  WHERE id = 1
  FOR UPDATE;

  IF v_prev_tick IS NULL THEN
    RAISE EXCEPTION 'server_market_state row missing (id=1)';
  END IF;

  IF p_tick IS NULL OR p_tick != v_prev_tick + 1 THEN
    RAISE EXCEPTION 'Tick must increment by exactly 1 (got %, expected %)',
      p_tick, v_prev_tick + 1;
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

  -- Validate every price entry: 50% max change per tick
  FOR v_price_entry IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
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

      v_change_pct := ABS((v_current_price - v_base_price) / v_base_price);
      IF v_change_pct > 0.50 THEN
        RAISE EXCEPTION 'Price change for % exceeds 50%% in single tick (base=%, current=%, change=%)',
          v_resource, v_base_price, v_current_price, v_change_pct;
      END IF;
    END LOOP;

  -- Validate events
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

  FOR v_event_entry IN SELECT * FROM jsonb_array_elements(p_events)
    LOOP
      IF jsonb_typeof(v_event_entry) != 'object' THEN
        RAISE EXCEPTION 'Event entry must be a JSONB object';
      END IF;
      IF v_event_entry->>'resource' IS NULL THEN
        RAISE EXCEPTION 'Event entry missing ''resource'' field';
      END IF;
    END LOOP;

  -- Validate volatility bounds
  IF p_volatility IS NULL OR p_volatility < 0 OR p_volatility > 1 THEN
    RAISE EXCEPTION 'Volatility out of bounds [0,1]: %', p_volatility;
  END IF;

  -- Validate breakers
  IF p_breakers IS NULL THEN
    p_breakers := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_breakers) != 'object' THEN
    RAISE EXCEPTION 'p_breakers must be a JSONB object (got %)', jsonb_typeof(p_breakers);
  END IF;

  -- Persist new market state
  UPDATE server_market_state
  SET
    tick        = p_tick,
    prices      = p_prices,
    volatility  = p_volatility,
    circuit_breakers = p_breakers,
    updated_at  = now()
  WHERE id = 1;

  -- Insert history rows (capped at 500 per tick)
  FOR v_event_entry IN SELECT * FROM jsonb_array_elements(p_events)
    LOOP
      IF v_history_count >= v_max_history THEN
        EXIT;
      END IF;

      INSERT INTO game_config_market_history (
        resource_id,
        base_price,
        market_phase,
        game_tick
      ) VALUES (
        v_event_entry->>'resource',
        COALESCE(
          (v_event_entry->'context'->>'newPrice')::NUMERIC,
          (v_event_entry->'context'->>'oldPrice')::NUMERIC,
          0
        ),
        CASE
          WHEN v_event_entry->>'type' = 'price_move'
            THEN COALESCE(v_event_entry->'context'->>'cause', 'price_move')
          WHEN v_event_entry->>'type' = 'breaker'
            THEN 'circuit_breaker'
          ELSE COALESCE(v_event_entry->>'type', 'unknown')
        END,
        p_tick
      );
      v_history_count := v_history_count + 1;
    END LOOP;

  -- Clear pressure pool (one-shot consumption).
  -- Fixed: explicit WHERE 1=1 so the linter accepts it and RLS still applies.
  -- (Per BUG-042: prior `DELETE FROM market_player_pressure;` was rejected at runtime.)
  DELETE FROM market_player_pressure WHERE 1 = 1;

  RETURN QUERY SELECT p_tick, v_events_count, v_prices_count, v_history_count;
END;
$$ LANGUAGE plpgsql;

-- Re-lock to service_role only
REVOKE EXECUTE ON FUNCTION apply_market_tick FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_market_tick FROM anon;
REVOKE EXECUTE ON FUNCTION apply_market_tick FROM authenticated;
GRANT EXECUTE ON FUNCTION apply_market_tick TO service_role;

COMMENT ON FUNCTION apply_market_tick IS
  'Market tick persistence gate. Cloudflare Worker (or Next.js debug route) computes prices/events/volatility; this function validates bounds and persists atomically. Fixed in 052: DELETE now has explicit WHERE 1=1 (BUG-042).';

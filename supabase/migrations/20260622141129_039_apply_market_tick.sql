-- Migration 039: apply_market_tick RPC — the persistence gate
--
-- Per Architecture Rule 1 (refined):
--   Cloudflare Workers EXECUTE the market tick (price math, circuit breakers,
--   volatility, event generation).
--   Supabase VALIDATES and PERSISTS market tick outputs.
--
-- This function is the SOLE writer of:
--   - server_market_state.tick, prices, volatility, circuit_breakers
--   - game_config_market_history (append-only)
--   - market_player_pressure (clear on consumption)
--
-- Validation gates:
--   1. Tick must increment by exactly 1 (prevents concurrent ticks)
--   2. Prices must be a non-empty JSON array
--   3. Each price: finite, positive, < 1e9, < 50% change from base
--   4. Events must be a JSON array (max 100)
--   5. Volatility must be in [0, 1]
--   6. Breakers must be a JSON object
--
-- Atomicity: validation + persistence in one transaction (FOR UPDATE row lock).
-- Failure modes: any validation error RAISES EXCEPTION and rolls back.

CREATE OR REPLACE FUNCTION apply_market_tick(
  p_tick       BIGINT,
  p_prices     JSONB,
  p_volatility REAL,
  p_events     JSONB     DEFAULT '[]'::jsonb,
  p_breakers   JSONB     DEFAULT '{}'::jsonb
) RETURNS TABLE (
  tick_number       BIGINT,
  events_recorded   INTEGER,
  prices_recorded   INTEGER,
  history_inserted  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_max_history      INTEGER := 500;  -- cap history rows per tick
BEGIN
  -- =====================================================================
  -- 1. LOCK + TICK VALIDATION
  -- =====================================================================
  -- FOR UPDATE prevents two simultaneous tick calls from racing.
  -- The second caller's p_tick won't match (current + 1) and will fail.

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

  -- =====================================================================
  -- 2. PRICES VALIDATION
  -- =====================================================================

  IF jsonb_typeof(p_prices) != 'array' THEN
    RAISE EXCEPTION 'p_prices must be a JSONB array (got %)', jsonb_typeof(p_prices);
  END IF;

  v_prices_count := jsonb_array_length(p_prices);
  IF v_prices_count = 0 THEN
    RAISE EXCEPTION 'p_prices array is empty — at least one resource required';
  END IF;
  IF v_prices_count > 1000 THEN
    RAISE EXCEPTION 'Too many prices in single tick (%, max 1000)', v_prices_count;
  END IF;

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

      -- Range check: finite, positive, sane upper bound (anti-overflow)
      IF v_current_price IS NULL OR v_current_price <= 0 OR v_current_price > 1e9 THEN
        RAISE EXCEPTION 'Invalid currentPrice for %: %', v_resource, v_current_price;
      END IF;
      IF v_base_price IS NULL OR v_base_price <= 0 OR v_base_price > 1e9 THEN
        RAISE EXCEPTION 'Invalid basePrice for %: %', v_resource, v_base_price;
      END IF;

      -- Sanity: price can't change more than 50% from base in a single tick
      -- (catches bugs + trivial cheats)
      v_change_pct := ABS((v_current_price - v_base_price) / v_base_price);
      IF v_change_pct > 0.50 THEN
        RAISE EXCEPTION 'Price change for % exceeds 50%% in single tick (base=%, current=%, change=%)',
          v_resource, v_base_price, v_current_price, v_change_pct;
      END IF;
    END LOOP;

  -- =====================================================================
  -- 3. EVENTS VALIDATION
  -- =====================================================================

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

  -- =====================================================================
  -- 4. VOLATILITY VALIDATION
  -- =====================================================================

  IF p_volatility IS NULL OR p_volatility < 0 OR p_volatility > 1 THEN
    RAISE EXCEPTION 'Volatility out of bounds [0,1]: %', p_volatility;
  END IF;

  -- =====================================================================
  -- 5. BREAKERS VALIDATION
  -- =====================================================================

  IF p_breakers IS NULL THEN
    p_breakers := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_breakers) != 'object' THEN
    RAISE EXCEPTION 'p_breakers must be a JSONB object (got %)', jsonb_typeof(p_breakers);
  END IF;

  -- =====================================================================
  -- 6. PERSIST (only after all validation passes)
  -- =====================================================================

  UPDATE server_market_state
  SET
    tick        = p_tick,
    prices      = p_prices,
    volatility  = p_volatility,
    circuit_breakers = p_breakers,
    updated_at  = now()
  WHERE id = 1;

  -- Append events to history (for price charts).
  -- Cap at v_max_history to prevent runaway growth from buggy ticks.
  FOR v_event_entry IN SELECT * FROM jsonb_array_elements(p_events)
    LOOP
      IF v_history_count >= v_max_history THEN
        EXIT;  -- stop inserting once we hit the cap
      END IF;

      INSERT INTO game_config_market_history (
        resource_id,
        base_price,
        market_phase,
        game_tick
      ) VALUES (
        v_event_entry->>'resource',
        -- Prefer newPrice from event context; fall back to current_price for breaker events
        COALESCE(
          (v_event_entry->'context'->>'newPrice')::NUMERIC,
          (v_event_entry->'context'->>'oldPrice')::NUMERIC,
          0
        ),
        -- market_phase: 'cause' for price moves, 'breaker' for circuit breaker events
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

  -- Clear pressure pool (one-shot consumption)
  DELETE FROM market_player_pressure;

  RETURN QUERY SELECT p_tick, v_events_count, v_prices_count, v_history_count;
END;
$$;

-- Lock down: only service_role can call this. Cloudflare Worker uses
-- service_role key. Next.js debug endpoint also uses service_role client.
REVOKE EXECUTE ON FUNCTION apply_market_tick(BIGINT, JSONB, REAL, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_market_tick(BIGINT, JSONB, REAL, JSONB, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION apply_market_tick(BIGINT, JSONB, REAL, JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION apply_market_tick(BIGINT, JSONB, REAL, JSONB, JSONB) TO service_role;

COMMENT ON FUNCTION apply_market_tick IS
  'Market tick persistence gate. Cloudflare Worker (or Next.js debug route) computes prices/events/volatility; this function validates bounds and persists atomically. Sole writer of server_market_state.tick, prices, volatility, circuit_breakers. Sole writer of game_config_market_history from market events. Sole clearer of market_player_pressure.';

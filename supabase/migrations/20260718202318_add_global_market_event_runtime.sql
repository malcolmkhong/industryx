-- Shared global-market event runtime. The market worker is the only caller of
-- apply_market_tick; this migration keeps event lifecycle and price persistence
-- in the same row lock and transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS public.global_market_event_schedule (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  check_interval_seconds INTEGER NOT NULL CHECK (check_interval_seconds > 0),
  trigger_chance NUMERIC NOT NULL CHECK (trigger_chance >= 0 AND trigger_chance <= 1),
  max_active_events INTEGER NOT NULL CHECK (max_active_events = 1),
  cooldown_seconds INTEGER NOT NULL CHECK (cooldown_seconds > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.global_market_event_schedule ENABLE ROW LEVEL SECURITY;

INSERT INTO public.global_market_event_schedule (
  id, check_interval_seconds, trigger_chance, max_active_events, cooldown_seconds
)
VALUES ('global', 1800, 0.20, 1, 1800)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.server_market_state
  ADD COLUMN IF NOT EXISTS active_global_event JSONB,
  ADD COLUMN IF NOT EXISTS global_event_cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS global_event_next_check_at TIMESTAMPTZ;

ALTER TABLE public.server_market_state
  DROP CONSTRAINT IF EXISTS server_market_state_active_global_event_object,
  ADD CONSTRAINT server_market_state_active_global_event_object
    CHECK (active_global_event IS NULL OR jsonb_typeof(active_global_event) = 'object');

DROP FUNCTION IF EXISTS public.apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB);

CREATE OR REPLACE FUNCTION public.apply_market_tick(
  p_tick BIGINT,
  p_prices JSONB,
  p_events JSONB,
  p_volatility NUMERIC,
  p_breakers JSONB,
  p_active_global_event JSONB,
  p_global_event_cooldown_until TIMESTAMPTZ,
  p_global_event_next_check_at TIMESTAMPTZ
)
RETURNS TABLE (
  tick_number BIGINT,
  events_recorded INTEGER,
  prices_recorded INTEGER,
  history_inserted INTEGER
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev_tick BIGINT;
  v_price_entry JSONB;
  v_event_entry JSONB;
  v_resource TEXT;
  v_current_price NUMERIC;
  v_base_price NUMERIC;
  v_prev_price NUMERIC;
  v_change_pct NUMERIC;
  v_prices_count INTEGER;
  v_events_count INTEGER;
  v_history_count INTEGER := 0;
  v_max_history INTEGER := 500;
  v_prev_prices JSONB;
  v_event_started_at TIMESTAMPTZ;
  v_event_expires_at TIMESTAMPTZ;
BEGIN
  SELECT tick, prices INTO v_prev_tick, v_prev_prices
  FROM public.server_market_state
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
  IF v_prices_count = 0 OR v_prices_count > 1000 THEN
    RAISE EXCEPTION 'p_prices count out of bounds: %', v_prices_count;
  END IF;

  FOR v_price_entry IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
    IF jsonb_typeof(v_price_entry) != 'object' THEN
      RAISE EXCEPTION 'Price entry must be a JSONB object';
    END IF;
    v_resource := v_price_entry->>'resource';
    v_current_price := (v_price_entry->>'currentPrice')::NUMERIC;
    v_base_price := (v_price_entry->>'basePrice')::NUMERIC;
    IF v_resource IS NULL OR v_resource = ''
      OR v_current_price IS NULL OR v_current_price <= 0 OR v_current_price > 1e9
      OR v_base_price IS NULL OR v_base_price <= 0 OR v_base_price > 1e9 THEN
      RAISE EXCEPTION 'Invalid price entry';
    END IF;
    SELECT (entry->>'currentPrice')::NUMERIC INTO v_prev_price
    FROM jsonb_array_elements(COALESCE(v_prev_prices, '[]'::jsonb)) AS entry
    WHERE entry->>'resource' = v_resource
    LIMIT 1;
    IF v_prev_price IS NOT NULL AND v_prev_price > 0 THEN
      v_change_pct := ABS((v_current_price - v_prev_price) / v_prev_price);
    ELSE
      v_change_pct := ABS((v_current_price - v_base_price) / v_base_price);
    END IF;
    IF v_change_pct > 0.50 THEN
      RAISE EXCEPTION 'Price change for % exceeds 50%% in a single tick', v_resource;
    END IF;
  END LOOP;

  IF p_events IS NULL THEN p_events := '[]'::jsonb; END IF;
  IF jsonb_typeof(p_events) != 'array' OR jsonb_array_length(p_events) > 100 THEN
    RAISE EXCEPTION 'p_events must be an array with at most 100 entries';
  END IF;
  v_events_count := jsonb_array_length(p_events);
  FOR v_event_entry IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    IF jsonb_typeof(v_event_entry) != 'object' OR v_event_entry->>'resource' IS NULL THEN
      RAISE EXCEPTION 'Invalid market history event';
    END IF;
  END LOOP;

  IF p_volatility IS NULL OR p_volatility < 0 OR p_volatility > 1 THEN
    RAISE EXCEPTION 'Volatility out of bounds [0,1]: %', p_volatility;
  END IF;
  IF p_breakers IS NULL THEN p_breakers := '{}'::jsonb; END IF;
  IF jsonb_typeof(p_breakers) != 'object' THEN
    RAISE EXCEPTION 'p_breakers must be a JSONB object';
  END IF;
  IF p_global_event_next_check_at IS NULL THEN
    RAISE EXCEPTION 'global event next check time is required';
  END IF;

  IF p_active_global_event IS NOT NULL THEN
    IF jsonb_typeof(p_active_global_event) != 'object'
      OR COALESCE(p_active_global_event->>'templateId', '') = ''
      OR COALESCE(p_active_global_event->>'name', '') = ''
      OR COALESCE(p_active_global_event->>'description', '') = ''
      OR COALESCE(p_active_global_event->>'icon', '') = ''
      OR jsonb_typeof(p_active_global_event->'effects') != 'array' THEN
      RAISE EXCEPTION 'Invalid active global market event';
    END IF;
    v_event_started_at := (p_active_global_event->>'startedAt')::TIMESTAMPTZ;
    v_event_expires_at := (p_active_global_event->>'expiresAt')::TIMESTAMPTZ;
    IF v_event_expires_at <= v_event_started_at THEN
      RAISE EXCEPTION 'Global market event expiry must follow start';
    END IF;
  END IF;
  IF p_global_event_cooldown_until IS NOT NULL
    AND p_global_event_cooldown_until < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Global market cooldown cannot be stale';
  END IF;

  UPDATE public.server_market_state
  SET tick = p_tick,
      prices = p_prices,
      volatility = p_volatility,
      circuit_breakers = p_breakers,
      active_global_event = p_active_global_event,
      global_event_cooldown_until = p_global_event_cooldown_until,
      global_event_next_check_at = p_global_event_next_check_at,
      updated_at = now()
  WHERE id = 1;

  FOR v_event_entry IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    EXIT WHEN v_history_count >= v_max_history;
    INSERT INTO public.game_config_market_history (resource_id, base_price, market_phase, game_tick)
    VALUES (
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

  DELETE FROM public.market_player_pressure WHERE 1 = 1;
  RETURN QUERY SELECT p_tick, v_events_count, v_prices_count, v_history_count;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.apply_market_tick(BIGINT, JSONB, JSONB, NUMERIC, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Atomic global market tick gate. Persists raw prices plus one server-owned global event lifecycle state.';

COMMIT;

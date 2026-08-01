-- Shared global-weather runtime. The Cloudflare scheduler owns weather
-- rotation; player tick processing only projects this singleton state.
BEGIN;

CREATE TABLE IF NOT EXISTS public.global_weather_schedule (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  min_duration_seconds INTEGER NOT NULL CHECK (min_duration_seconds >= 1800),
  max_duration_seconds INTEGER NOT NULL CHECK (max_duration_seconds <= 3600),
  min_intensity NUMERIC NOT NULL CHECK (min_intensity >= 0 AND min_intensity <= 1),
  max_intensity NUMERIC NOT NULL CHECK (max_intensity >= 0 AND max_intensity <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_weather_schedule_duration_order
    CHECK (max_duration_seconds >= min_duration_seconds),
  CONSTRAINT global_weather_schedule_intensity_order
    CHECK (max_intensity >= min_intensity)
);

ALTER TABLE public.global_weather_schedule ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.server_weather_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_weather TEXT NOT NULL REFERENCES public.game_config_weather(id),
  intensity NUMERIC NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  started_at TIMESTAMPTZ NOT NULL,
  next_change_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT server_weather_state_time_order CHECK (next_change_at > started_at)
);

ALTER TABLE public.server_weather_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.game_config_weather WHERE id = 'clear') THEN
    RAISE EXCEPTION 'Cannot initialise global weather: game_config_weather.clear is missing';
  END IF;
END;
$$;

INSERT INTO public.global_weather_schedule (
  id,
  min_duration_seconds,
  max_duration_seconds,
  min_intensity,
  max_intensity
)
VALUES ('global', 1800, 3600, 0.30, 1.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.server_weather_state (
  id,
  current_weather,
  intensity,
  started_at,
  next_change_at
)
VALUES (1, 'clear', 1.00, now(), now() + interval '30 minutes')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.advance_global_weather(
  p_expected_next_change_at TIMESTAMPTZ,
  p_current_weather TEXT,
  p_intensity NUMERIC,
  p_started_at TIMESTAMPTZ,
  p_next_change_at TIMESTAMPTZ
)
RETURNS TABLE (
  current_weather TEXT,
  intensity NUMERIC,
  started_at TIMESTAMPTZ,
  next_change_at TIMESTAMPTZ,
  did_advance BOOLEAN
)
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_weather TEXT;
  v_intensity NUMERIC;
  v_started_at TIMESTAMPTZ;
  v_next_change_at TIMESTAMPTZ;
BEGIN
  IF p_expected_next_change_at IS NULL
    OR p_current_weather IS NULL
    OR p_intensity IS NULL
    OR p_started_at IS NULL
    OR p_next_change_at IS NULL
    OR p_intensity < 0
    OR p_intensity > 1
    OR p_next_change_at <= p_started_at THEN
    RAISE EXCEPTION 'Invalid global weather transition payload';
  END IF;

  PERFORM 1
  FROM public.game_config_weather
  WHERE id = p_current_weather;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown configured weather type: %', p_current_weather;
  END IF;

  SELECT sws.current_weather, sws.intensity, sws.started_at, sws.next_change_at
  INTO v_current_weather, v_intensity, v_started_at, v_next_change_at
  FROM public.server_weather_state AS sws
  WHERE sws.id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'server_weather_state singleton row missing';
  END IF;

  -- A concurrent scheduler already won, or this transition is not yet due.
  -- Return the authoritative row rather than performing a second rotation.
  IF v_next_change_at > now() OR v_next_change_at <> p_expected_next_change_at THEN
    RETURN QUERY SELECT v_current_weather, v_intensity, v_started_at, v_next_change_at, FALSE;
    RETURN;
  END IF;

  UPDATE public.server_weather_state AS sws
  SET current_weather = p_current_weather,
      intensity = p_intensity,
      started_at = p_started_at,
      next_change_at = p_next_change_at,
      updated_at = now()
  WHERE sws.id = 1;

  RETURN QUERY SELECT p_current_weather, p_intensity, p_started_at, p_next_change_at, TRUE;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON TABLE public.global_weather_schedule FROM PUBLIC;
REVOKE ALL ON TABLE public.server_weather_state FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_global_weather(TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_global_weather(TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_global_weather(TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
GRANT SELECT ON TABLE public.global_weather_schedule TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.server_weather_state TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_global_weather(TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.advance_global_weather(TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Atomic shared-weather rotation. Only the service-role scheduler may call it.';

COMMIT;

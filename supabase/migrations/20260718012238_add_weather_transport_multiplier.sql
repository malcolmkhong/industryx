-- Weather transport is server-configured. Existing weather severity is
-- preserved by backfilling from the current production multiplier.
ALTER TABLE public.game_config_weather
  ADD COLUMN IF NOT EXISTS transport_multiplier NUMERIC;

UPDATE public.game_config_weather
SET transport_multiplier = production_multiplier
WHERE transport_multiplier IS NULL;

ALTER TABLE public.game_config_weather
  ALTER COLUMN transport_multiplier SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_config_weather_transport_multiplier_positive'
      AND conrelid = 'public.game_config_weather'::regclass
  ) THEN
    ALTER TABLE public.game_config_weather
      ADD CONSTRAINT game_config_weather_transport_multiplier_positive
      CHECK (transport_multiplier > 0);
  END IF;
END $$;

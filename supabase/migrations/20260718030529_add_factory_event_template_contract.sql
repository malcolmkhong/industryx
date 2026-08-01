-- Explicit server-owned contract for factory and global-market event templates.
-- Runtime code consumes only factory rows; global-market rows are prepared for
-- their later shared-worker implementation and are never placed in player state.
BEGIN;

ALTER TABLE public.game_config_event_templates
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS selection_weight INTEGER,
  ADD COLUMN IF NOT EXISTS duration_unit TEXT,
  ADD COLUMN IF NOT EXISTS duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS duration_max INTEGER,
  ADD COLUMN IF NOT EXISTS repeat_cooldown_checks INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

-- Approved per-player factory cadence. These existing generic fields now have
-- one unambiguous owner: the factory-event server tick.
UPDATE public.game_config_game
SET event_trigger_interval = 600,
    event_trigger_chance = 0.40,
    max_concurrent_events = 1
WHERE id = 'global';

-- Preserve the original market effects on global-market templates. Mixed rows
-- are split below so no factory event can alter shared market prices.
UPDATE public.game_config_event_templates
SET scope = CASE id
      WHEN 'energyShortage' THEN 'factory'
      WHEN 'naturalDisaster' THEN 'factory'
      WHEN 'techBreakthrough' THEN 'factory'
      ELSE 'global_market'
    END,
    selection_weight = 1,
    duration_unit = CASE
      WHEN id IN ('energyShortage', 'naturalDisaster', 'techBreakthrough') THEN 'ticks'
      ELSE 'seconds'
    END,
    duration_min = CASE
      WHEN id IN ('energyShortage', 'naturalDisaster', 'techBreakthrough') THEN 600
      ELSE 1800
    END,
    duration_max = CASE
      WHEN id IN ('energyShortage', 'naturalDisaster', 'techBreakthrough') THEN 1200
      ELSE 5400
    END,
    repeat_cooldown_checks = CASE
      WHEN id IN ('energyShortage', 'naturalDisaster', 'techBreakthrough') THEN 3
      ELSE 0
    END,
    is_active = true;

UPDATE public.game_config_event_templates
SET effects = CASE id
  WHEN 'oilCrisis' THEN '[{"target":"oil","type":"marketPriceMultiplier","value":2.5}]'::jsonb
  WHEN 'aiRevolution' THEN '[{"target":"aiChip","type":"marketPriceMultiplier","value":2}]'::jsonb
  WHEN 'greenInitiative' THEN '[{"target":"coal","type":"marketPriceMultiplier","value":0.6}]'::jsonb
  ELSE effects
END
WHERE id IN ('oilCrisis', 'aiRevolution', 'greenInitiative');

-- The per-player side of the three legacy mixed events. All selection and
-- duration values live in this server-owned config table, never in runtime code.
INSERT INTO public.game_config_event_templates (
  id, name, description, type, duration, effects, icon, sort_order,
  scope, selection_weight, duration_unit, duration_min, duration_max,
  repeat_cooldown_checks, is_active
)
VALUES
  (
    'oilPumpFailure', 'Oil Pump Failure',
    'A local oil pump failure reduces this factory''s oil output.',
    'oilPumpFailure', 1200,
    '[{"target":"oilPump","type":"productionMultiplier","value":0.5}]'::jsonb,
    'game-icons:oil-rig', 10,
    'factory', 1, 'ticks', 600, 1200, 3, true
  ),
  (
    'aiResearchSurge', 'AI Research Surge',
    'A local AI research breakthrough accelerates this factory''s research.',
    'aiResearchSurge', 1200,
    '[{"type":"researchSpeed","value":2}]'::jsonb,
    'game-icons:brain', 11,
    'factory', 1, 'ticks', 600, 1200, 3, true
  ),
  (
    'renewableOutputBoost', 'Renewable Output Boost',
    'Local renewable optimization improves solar and wind output.',
    'renewableOutputBoost', 1200,
    '[{"target":"solarPanel","type":"productionMultiplier","value":1.5},{"target":"windTurbine","type":"productionMultiplier","value":1.5}]'::jsonb,
    'game-icons:sprout', 12,
    'factory', 1, 'ticks', 600, 1200, 3, true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  duration = EXCLUDED.duration,
  effects = EXCLUDED.effects,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  scope = EXCLUDED.scope,
  selection_weight = EXCLUDED.selection_weight,
  duration_unit = EXCLUDED.duration_unit,
  duration_min = EXCLUDED.duration_min,
  duration_max = EXCLUDED.duration_max,
  repeat_cooldown_checks = EXCLUDED.repeat_cooldown_checks,
  is_active = EXCLUDED.is_active;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.game_config_event_templates
    WHERE scope IS NULL
      OR selection_weight IS NULL
      OR duration_unit IS NULL
      OR duration_min IS NULL
      OR duration_max IS NULL
      OR repeat_cooldown_checks IS NULL
      OR is_active IS NULL
  ) THEN
    RAISE EXCEPTION 'every event template must be classified before enforcing the event contract';
  END IF;
END $$;

ALTER TABLE public.game_config_event_templates
  ALTER COLUMN scope SET NOT NULL,
  ALTER COLUMN selection_weight SET NOT NULL,
  ALTER COLUMN duration_unit SET NOT NULL,
  ALTER COLUMN duration_min SET NOT NULL,
  ALTER COLUMN duration_max SET NOT NULL,
  ALTER COLUMN repeat_cooldown_checks SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL;

ALTER TABLE public.game_config_event_templates
  DROP CONSTRAINT IF EXISTS game_config_event_templates_scope_check,
  ADD CONSTRAINT game_config_event_templates_scope_check
    CHECK (scope IN ('factory', 'global_market')),
  DROP CONSTRAINT IF EXISTS game_config_event_templates_selection_weight_check,
  ADD CONSTRAINT game_config_event_templates_selection_weight_check
    CHECK (selection_weight > 0),
  DROP CONSTRAINT IF EXISTS game_config_event_templates_duration_unit_check,
  ADD CONSTRAINT game_config_event_templates_duration_unit_check
    CHECK (duration_unit IN ('ticks', 'seconds')),
  DROP CONSTRAINT IF EXISTS game_config_event_templates_duration_bounds_check,
  ADD CONSTRAINT game_config_event_templates_duration_bounds_check
    CHECK (duration_min > 0 AND duration_max >= duration_min),
  DROP CONSTRAINT IF EXISTS game_config_event_templates_repeat_cooldown_check,
  ADD CONSTRAINT game_config_event_templates_repeat_cooldown_check
    CHECK (repeat_cooldown_checks >= 0),
  DROP CONSTRAINT IF EXISTS game_config_event_templates_factory_shape_check,
  ADD CONSTRAINT game_config_event_templates_factory_shape_check
    CHECK (
      scope <> 'factory'
      OR duration_unit = 'ticks'
    );

COMMIT;

-- Phase 12 — Initial State Server-Side (P0 data-loss fix).
--
-- Adds:
--   game_config_resources.base_capacity            -- per-resource default storage cap
--   game_config_game.weather_change_min_ticks      -- weather cadence lower bound
--   game_config_game.weather_change_max_ticks      -- weather cadence upper bound
--   game_config_game.initial_drone_speed_level     -- starting drone level
--   game_config_game.initial_drone_capacity_level
--   game_config_game.initial_drone_fuel_efficiency_level
--
-- Seeds base_capacity from the values previously hardcoded in
-- src/lib/game/constants/initialState.ts (initialCapacity map). No behavior
-- change vs current client defaults — this migration only moves the source
-- of truth into the DB so that initializeGuestGameState can build a full
-- canonical GameState server-side.

BEGIN;

------------------------------------------------------------------
-- game_config_resources: base_capacity per resource
------------------------------------------------------------------
ALTER TABLE game_config_resources
  ADD COLUMN IF NOT EXISTS base_capacity integer NOT NULL DEFAULT 100
    CHECK (base_capacity >= 0);

-- Seed to mirror src/lib/game/constants/initialState.ts:initialCapacity.
UPDATE game_config_resources SET base_capacity = CASE id
  -- T0 raw
  WHEN 'iron' THEN 100
  WHEN 'copper' THEN 100
  WHEN 'coal' THEN 100
  WHEN 'oil' THEN 100
  WHEN 'sand' THEN 100
  WHEN 'lithium' THEN 50
  WHEN 'water' THEN 200
  WHEN 'clay' THEN 500
  WHEN 'limestone' THEN 500
  WHEN 'gravel' THEN 500
  WHEN 'bauxite' THEN 200
  WHEN 'wolframite' THEN 100
  WHEN 'silver' THEN 100
  WHEN 'gold' THEN 100
  -- T1 processed
  WHEN 'rareEarth' THEN 20
  WHEN 'ironPlate' THEN 50
  WHEN 'copperWire' THEN 50
  WHEN 'plastic' THEN 50
  WHEN 'glass' THEN 50
  WHEN 'carbon' THEN 30
  WHEN 'bricks' THEN 200
  WHEN 'concrete' THEN 200
  WHEN 'fertilizer' THEN 200
  WHEN 'steel' THEN 40
  WHEN 'fossilFuel' THEN 200
  -- T2 intermediate
  WHEN 'circuit' THEN 30
  WHEN 'engine' THEN 20
  WHEN 'battery' THEN 30
  WHEN 'gear' THEN 40
  WHEN 'silicon' THEN 100
  WHEN 'aluminium' THEN 100
  WHEN 'insecticide' THEN 100
  WHEN 'copperIngot' THEN 100
  WHEN 'titanium' THEN 100
  WHEN 'coolant' THEN 100
  WHEN 'fiberOptics' THEN 100
  WHEN 'solarCell' THEN 100
  WHEN 'powerCell' THEN 100
  WHEN 'reinforcedConcrete' THEN 200
  WHEN 'refinedSilver' THEN 50
  WHEN 'refinedGold' THEN 50
  -- T3 advanced
  WHEN 'aiChip' THEN 10
  WHEN 'robotics' THEN 5
  WHEN 'quantumPart' THEN 5
  WHEN 'advancedAlloy' THEN 10
  WHEN 'nanoMaterial' THEN 3
  WHEN 'electronics' THEN 50
  WHEN 'medicalTech' THEN 50
  WHEN 'jewellery' THEN 25
  WHEN 'tungsten' THEN 50
  WHEN 'weapons' THEN 50
  WHEN 'scanDrone' THEN 25
  WHEN 'artifactDetector' THEN 25
  WHEN 'neuralNetwork' THEN 25
  WHEN 'carbonComposite' THEN 25
  WHEN 'structuralFrame' THEN 25
  WHEN 'fusionCell' THEN 25
  WHEN 'solarPanel' THEN 50
  WHEN 'creditChip' THEN 25
  -- T4 endgame
  WHEN 'singularityCore' THEN 50
  WHEN 'darkMatterCell' THEN 50
  WHEN 'warpDrive' THEN 50
  WHEN 'antimatter' THEN 50
  WHEN 'chronoPart' THEN 50
  WHEN 'plasmaCore' THEN 50
  WHEN 'megaStructure' THEN 50
  WHEN 'voidCrystal' THEN 50
  WHEN 'arcologyModule' THEN 25
  WHEN 'habitatModule' THEN 25
  WHEN 'stellarEnergy' THEN 25
  WHEN 'luxuryGoods' THEN 25
  WHEN 'tradeContract' THEN 25
  WHEN 'teleporterNode' THEN 25
  -- T5 transcendent
  WHEN 'researchMatrix' THEN 10
  WHEN 'worldCore' THEN 10
  WHEN 'shieldMatrix' THEN 10
  WHEN 'stellarForge' THEN 10
  WHEN 'voidEnergy' THEN 10
  WHEN 'marketDominance' THEN 10
  WHEN 'corpCapital' THEN 10
  WHEN 'dimensionalGate' THEN 10
  WHEN 'armadaFleet' THEN 10
  ELSE base_capacity
END;

------------------------------------------------------------------
-- game_config_game: weather cadence + starting drone defaults
------------------------------------------------------------------
ALTER TABLE game_config_game
  ADD COLUMN IF NOT EXISTS weather_change_min_ticks integer NOT NULL DEFAULT 100
    CHECK (weather_change_min_ticks > 0),
  ADD COLUMN IF NOT EXISTS weather_change_max_ticks integer NOT NULL DEFAULT 300
    CHECK (weather_change_max_ticks > 0),
  ADD COLUMN IF NOT EXISTS initial_drone_speed_level integer NOT NULL DEFAULT 1
    CHECK (initial_drone_speed_level >= 1),
  ADD COLUMN IF NOT EXISTS initial_drone_capacity_level integer NOT NULL DEFAULT 1
    CHECK (initial_drone_capacity_level >= 1),
  ADD COLUMN IF NOT EXISTS initial_drone_fuel_efficiency_level integer NOT NULL DEFAULT 1
    CHECK (initial_drone_fuel_efficiency_level >= 1);

ALTER TABLE game_config_game
  DROP CONSTRAINT IF EXISTS weather_change_max_gte_min,
  ADD CONSTRAINT weather_change_max_gte_min
    CHECK (weather_change_max_ticks >= weather_change_min_ticks);

COMMIT;

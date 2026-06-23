-- 035_market_resource_config.sql
-- Per-resource market configuration: sector and elasticity.
-- Replaces hardcoded RESOURCE_SECTOR and RESOURCE_ELASTICITY in
-- src/lib/game/marketSimulator.ts as the SOURCE OF TRUTH.
-- The TypeScript maps remain as offline / SSR fallback only.
--
-- This migration is one-way for the backfill — the CASE-WHEN below
-- overwrites the default ('raw_minerals', 0.4) with the per-resource
-- values that match the current hardcoded maps. Re-running will reset
-- to these values; admin customizations after the migration will be
-- preserved on re-run only if you re-apply them.

-- ─── Schema ──────────────────────────────────────────────────────────────

ALTER TABLE game_config_market
  ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'raw_minerals'
    CHECK (sector IN (
      'raw_minerals',
      'raw_organic',
      'basic_materials',
      'components',
      'advanced',
      'high_tech',
      'endgame',
      'agriculture'
    )),
  ADD COLUMN IF NOT EXISTS elasticity REAL NOT NULL DEFAULT 0.4
    CHECK (elasticity >= 0 AND elasticity <= 1.5);

-- Index for sector-based queries (e.g., "all raw minerals", sector trends)
CREATE INDEX IF NOT EXISTS idx_game_config_market_sector
  ON game_config_market (sector);

-- ─── Backfill: sector ───────────────────────────────────────────────────

UPDATE game_config_market
SET sector = CASE resource_id
  -- Raw minerals
  WHEN 'iron'         THEN 'raw_minerals'
  WHEN 'copper'       THEN 'raw_minerals'
  WHEN 'coal'         THEN 'raw_minerals'
  WHEN 'sand'         THEN 'raw_minerals'
  WHEN 'lithium'      THEN 'raw_minerals'
  WHEN 'clay'         THEN 'raw_minerals'
  WHEN 'limestone'    THEN 'raw_minerals'
  WHEN 'gravel'       THEN 'raw_minerals'
  WHEN 'bauxite'      THEN 'raw_minerals'
  WHEN 'wolframite'   THEN 'raw_minerals'
  WHEN 'silver'       THEN 'raw_minerals'
  WHEN 'gold'         THEN 'raw_minerals'
  -- Raw organic
  WHEN 'oil'          THEN 'raw_organic'
  WHEN 'water'        THEN 'raw_organic'
  WHEN 'rareEarth'    THEN 'raw_organic'
  -- Basic materials
  WHEN 'ironPlate'           THEN 'basic_materials'
  WHEN 'copperWire'          THEN 'basic_materials'
  WHEN 'plastic'             THEN 'basic_materials'
  WHEN 'glass'               THEN 'basic_materials'
  WHEN 'carbon'              THEN 'basic_materials'
  WHEN 'bricks'              THEN 'basic_materials'
  WHEN 'concrete'            THEN 'basic_materials'
  WHEN 'steel'               THEN 'basic_materials'
  WHEN 'aluminium'           THEN 'basic_materials'
  WHEN 'reinforcedConcrete'  THEN 'basic_materials'
  -- Components
  WHEN 'gear'          THEN 'components'
  WHEN 'circuit'       THEN 'components'
  WHEN 'battery'       THEN 'components'
  WHEN 'coolant'       THEN 'components'
  WHEN 'fiberOptics'   THEN 'components'
  WHEN 'solarCell'     THEN 'components'
  WHEN 'copperIngot'   THEN 'components'
  WHEN 'silicon'       THEN 'components'
  WHEN 'powerCell'     THEN 'components'
  WHEN 'refinedSilver' THEN 'components'
  WHEN 'refinedGold'   THEN 'components'
  WHEN 'solarPanel'    THEN 'components'
  -- Advanced
  WHEN 'engine'         THEN 'advanced'
  WHEN 'advancedAlloy'  THEN 'advanced'
  WHEN 'electronics'    THEN 'advanced'
  WHEN 'tungsten'       THEN 'advanced'
  WHEN 'titanium'       THEN 'advanced'
  WHEN 'weapons'        THEN 'advanced'
  WHEN 'medicalTech'    THEN 'advanced'
  WHEN 'jewellery'      THEN 'advanced'
  WHEN 'carbonComposite' THEN 'advanced'
  WHEN 'structuralFrame' THEN 'advanced'
  WHEN 'fusionCell'     THEN 'advanced'
  WHEN 'creditChip'     THEN 'advanced'
  -- High tech
  WHEN 'aiChip'            THEN 'high_tech'
  WHEN 'robotics'          THEN 'high_tech'
  WHEN 'neuralNetwork'     THEN 'high_tech'
  WHEN 'scanDrone'         THEN 'high_tech'
  WHEN 'artifactDetector'  THEN 'high_tech'
  WHEN 'quantumPart'       THEN 'high_tech'
  -- Endgame
  WHEN 'singularityCore'  THEN 'endgame'
  WHEN 'darkMatterCell'   THEN 'endgame'
  WHEN 'warpDrive'        THEN 'endgame'
  WHEN 'antimatter'       THEN 'endgame'
  WHEN 'chronoPart'       THEN 'endgame'
  WHEN 'plasmaCore'       THEN 'endgame'
  WHEN 'megaStructure'    THEN 'endgame'
  WHEN 'voidCrystal'      THEN 'endgame'
  WHEN 'nanoMaterial'     THEN 'endgame'
  WHEN 'arcologyModule'   THEN 'endgame'
  WHEN 'habitatModule'    THEN 'endgame'
  WHEN 'stellarEnergy'    THEN 'endgame'
  WHEN 'luxuryGoods'      THEN 'endgame'
  WHEN 'tradeContract'    THEN 'endgame'
  WHEN 'teleporterNode'   THEN 'endgame'
  WHEN 'researchMatrix'   THEN 'endgame'
  WHEN 'worldCore'        THEN 'endgame'
  WHEN 'shieldMatrix'     THEN 'endgame'
  WHEN 'stellarForge'     THEN 'endgame'
  WHEN 'voidEnergy'       THEN 'endgame'
  WHEN 'marketDominance'  THEN 'endgame'
  WHEN 'corpCapital'      THEN 'endgame'
  WHEN 'dimensionalGate'  THEN 'endgame'
  WHEN 'armadaFleet'      THEN 'endgame'
  -- Agriculture
  WHEN 'fertilizer'  THEN 'agriculture'
  WHEN 'insecticide' THEN 'agriculture'
  WHEN 'fossilFuel'  THEN 'agriculture'
  ELSE sector  -- leave unchanged for any resources not listed above
END
WHERE sector = 'raw_minerals';  -- only backfill rows that still have the default

-- ─── Backfill: elasticity ───────────────────────────────────────────────

UPDATE game_config_market
SET elasticity = CASE resource_id
  -- Raw minerals (inelastic)
  WHEN 'iron'         THEN 0.3
  WHEN 'copper'       THEN 0.3
  WHEN 'coal'         THEN 0.25
  WHEN 'sand'         THEN 0.2
  WHEN 'lithium'      THEN 0.4
  WHEN 'clay'         THEN 0.15
  WHEN 'limestone'    THEN 0.15
  WHEN 'gravel'       THEN 0.1
  WHEN 'bauxite'      THEN 0.35
  WHEN 'wolframite'   THEN 0.5
  WHEN 'silver'       THEN 0.5
  WHEN 'gold'         THEN 0.6
  -- Raw organic
  WHEN 'oil'          THEN 0.45
  WHEN 'water'        THEN 0.1
  WHEN 'rareEarth'    THEN 0.55
  -- Basic materials
  WHEN 'ironPlate'           THEN 0.35
  WHEN 'copperWire'          THEN 0.35
  WHEN 'plastic'             THEN 0.4
  WHEN 'glass'               THEN 0.3
  WHEN 'carbon'              THEN 0.35
  WHEN 'bricks'              THEN 0.2
  WHEN 'concrete'            THEN 0.2
  WHEN 'steel'               THEN 0.4
  WHEN 'aluminium'           THEN 0.4
  WHEN 'reinforcedConcrete'  THEN 0.25
  -- Components
  WHEN 'gear'          THEN 0.45
  WHEN 'circuit'       THEN 0.5
  WHEN 'battery'       THEN 0.45
  WHEN 'coolant'       THEN 0.3
  WHEN 'fiberOptics'   THEN 0.5
  WHEN 'solarCell'     THEN 0.5
  WHEN 'copperIngot'   THEN 0.35
  WHEN 'silicon'       THEN 0.45
  WHEN 'powerCell'     THEN 0.5
  WHEN 'refinedSilver' THEN 0.55
  WHEN 'refinedGold'   THEN 0.6
  WHEN 'solarPanel'    THEN 0.5
  -- Advanced
  WHEN 'engine'         THEN 0.6
  WHEN 'advancedAlloy'  THEN 0.6
  WHEN 'electronics'    THEN 0.55
  WHEN 'tungsten'       THEN 0.55
  WHEN 'titanium'       THEN 0.55
  WHEN 'weapons'        THEN 0.65
  WHEN 'medicalTech'    THEN 0.6
  WHEN 'jewellery'      THEN 0.8
  WHEN 'carbonComposite' THEN 0.6
  WHEN 'structuralFrame' THEN 0.55
  WHEN 'fusionCell'     THEN 0.7
  WHEN 'creditChip'     THEN 0.75
  -- High tech
  WHEN 'aiChip'            THEN 0.7
  WHEN 'robotics'          THEN 0.7
  WHEN 'neuralNetwork'     THEN 0.7
  WHEN 'scanDrone'         THEN 0.65
  WHEN 'artifactDetector'  THEN 0.7
  WHEN 'quantumPart'       THEN 0.8
  -- Endgame (very elastic — speculative markets)
  WHEN 'singularityCore'  THEN 0.9
  WHEN 'darkMatterCell'   THEN 0.95
  WHEN 'warpDrive'        THEN 0.95
  WHEN 'antimatter'       THEN 0.85
  WHEN 'chronoPart'       THEN 1.0
  WHEN 'plasmaCore'       THEN 0.8
  WHEN 'megaStructure'    THEN 0.75
  WHEN 'voidCrystal'      THEN 0.95
  WHEN 'nanoMaterial'     THEN 0.9
  WHEN 'arcologyModule'   THEN 0.85
  WHEN 'habitatModule'    THEN 0.8
  WHEN 'stellarEnergy'    THEN 0.9
  WHEN 'luxuryGoods'      THEN 0.95
  WHEN 'tradeContract'    THEN 0.85
  WHEN 'teleporterNode'   THEN 0.9
  WHEN 'researchMatrix'   THEN 1.0
  WHEN 'worldCore'        THEN 0.95
  WHEN 'shieldMatrix'     THEN 0.9
  WHEN 'stellarForge'     THEN 0.95
  WHEN 'voidEnergy'       THEN 1.0
  WHEN 'marketDominance'  THEN 0.95
  WHEN 'corpCapital'      THEN 1.0
  WHEN 'dimensionalGate'  THEN 1.0
  WHEN 'armadaFleet'      THEN 1.0
  -- Agriculture (inelastic)
  WHEN 'fertilizer'  THEN 0.25
  WHEN 'insecticide' THEN 0.3
  WHEN 'fossilFuel'  THEN 0.4
  ELSE elasticity  -- leave unchanged for unlisted resources
END
WHERE elasticity = 0.4;  -- only backfill rows that still have the default

-- ─── Verification queries (commented out — run manually to inspect) ─────
-- SELECT sector, count(*) FROM game_config_market GROUP BY sector ORDER BY sector;
-- SELECT resource_id, sector, elasticity FROM game_config_market ORDER BY resource_id;

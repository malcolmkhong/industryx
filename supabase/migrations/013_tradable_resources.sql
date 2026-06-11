-- ============================================================================
-- Migration: 013_tradable_resources
-- Description: Make TRADABLE_RESOURCES config-driven (no longer hardcoded)
-- Purpose:     Add `is_tradable` column to game_config_market so admins can edit
--              which resources are market-tradable without redeploying.
--
-- CONTEXT:
--   Prior to this migration, the tradable resources list was hardcoded in two
--   places (src/lib/game/tradeConstants.ts and consumers), creating drift risk.
--   Now the list is DB-driven and consumed via the existing game config
--   pipeline (/api/game/definitions + configCache.ts).
--
-- CONSUMER FLOW:
--   1. Server: getTradableResources() in configCache.ts reads is_tradable=true
--      rows from game_config_market (5-minute in-memory cache)
--   2. /api/game/definitions exposes tradableResourceIds in the response
--   3. Client: receives via GameConfigProvider on mount (5-min refresh)
--   4. Trade route + TradingPostPanel consume the cached list
--
-- BACKFILL: Tier 0 (raw) + Tier 1 (basic processed) resources marked tradable.
-- This matches the prior hardcoded list exactly.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================


-- ============================================================================
-- PART 1: Add is_tradable column with safe default
-- Purpose: Existing rows default to FALSE (conservative — admin must opt-in
--          any new resources). This prevents accidental "trade everything"
--          when new resources are added to the table.
-- ============================================================================

ALTER TABLE game_config_market
  ADD COLUMN IF NOT EXISTS is_tradable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN game_config_market.is_tradable IS
  'Whether this resource is listed on the Trading Post. Admin-editable; no deploy required.';


-- ============================================================================
-- PART 2: Backfill with the prior hardcoded list (Tier 0 + Tier 1)
-- Purpose: Preserve existing behavior. The prior hardcoded list lived in
--          src/lib/game/tradeConstants.ts and contained 25 raw + tier-1 resources.
-- ============================================================================

UPDATE game_config_market SET is_tradable = true
WHERE resource_id IN (
  -- Tier 0 - Raw materials (15)
  'iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water',
  'clay', 'limestone', 'gravel', 'bauxite', 'wolframite', 'rareEarth',
  'silver', 'gold',
  -- Tier 1 - Basic processed (10)
  'ironPlate', 'copperWire', 'plastic', 'glass', 'carbon',
  'bricks', 'concrete', 'fertilizer', 'steel', 'fossilFuel'
);

COMMENT ON TABLE game_config_market IS
  'Per-resource market config. is_tradable controls Trading Post visibility (admin-editable, no deploy required).';

-- ============================================
-- Tier-5 Full Wiring
-- ============================================
-- Phase A of TIER5_WIRING_PLAN.md
--
-- Fixes:
--   1. Tier-5 base_production_rate was 0.003-0.006 (10x slower than tier-4 0.05)
--      -> corrected to 0.05 (industry standard 1x tier-4)
--   2. Tier-5 build cost was 4-10M (10x tier-4 ~550K)
--      -> corrected to 20-50M (50x tier-4 industry standard)
--   3. Tier-5 power draw was 80-150 MW (1.5x tier-4 55MW)
--      -> corrected to 280-600 MW (5-7x tier-4 industry standard)
--   4. 5 dead-end resources had no upstream producers:
--      arcologyModule, stellarForge, voidEnergy, tradeContract, marketDominance
--      -> added 5 tier-4.5 buildings that produce them
--   5. Added rp_factory_t5_rate column (was missing for Phase 3 code wiring)
-- ============================================

-- 1. FIX TIER-5 PRODUCTION RATE (10x correction)
UPDATE game_config_buildings
SET base_production_rate = 0.05
WHERE tier = 5 AND category = 'factory';

-- 2. FIX TIER-5 BUILD COST (industry standard 50x tier-4)
UPDATE game_config_buildings SET base_cost = '[{"amount": 25000000, "resource": "money"}]'::jsonb WHERE id = 'omniscienceArray';
UPDATE game_config_buildings SET base_cost = '[{"amount": 20000000, "resource": "money"}]'::jsonb WHERE id = 'worldEngine';
UPDATE game_config_buildings SET base_cost = '[{"amount": 30000000, "resource": "money"}]'::jsonb WHERE id = 'planetaryShield';
UPDATE game_config_buildings SET base_cost = '[{"amount": 22500000, "resource": "money"}]'::jsonb WHERE id = 'starReactor';
UPDATE game_config_buildings SET base_cost = '[{"amount": 40000000, "resource": "money"}]'::jsonb WHERE id = 'voidEngine';
UPDATE game_config_buildings SET base_cost = '[{"amount": 25000000, "resource": "money"}]'::jsonb WHERE id = 'quantumExchange';
UPDATE game_config_buildings SET base_cost = '[{"amount": 50000000, "resource": "money"}]'::jsonb WHERE id = 'megaCorpHQ';
UPDATE game_config_buildings SET base_cost = '[{"amount": 35000000, "resource": "money"}]'::jsonb WHERE id = 'dimensionalNexus';
UPDATE game_config_buildings SET base_cost = '[{"amount": 45000000, "resource": "money"}]'::jsonb WHERE id = 'galacticArmada';

-- 3. FIX TIER-5 POWER DRAW (industry standard 5-7x tier-4)
UPDATE game_config_buildings SET base_power_consumption = 350 WHERE id = 'omniscienceArray';
UPDATE game_config_buildings SET base_power_consumption = 300 WHERE id = 'worldEngine';
UPDATE game_config_buildings SET base_power_consumption = 400 WHERE id = 'planetaryShield';
UPDATE game_config_buildings SET base_power_consumption = 280 WHERE id = 'starReactor';
UPDATE game_config_buildings SET base_power_consumption = 550 WHERE id = 'voidEngine';
UPDATE game_config_buildings SET base_power_consumption = 350 WHERE id = 'quantumExchange';
UPDATE game_config_buildings SET base_power_consumption = 420 WHERE id = 'megaCorpHQ';
UPDATE game_config_buildings SET base_power_consumption = 450 WHERE id = 'dimensionalNexus';
UPDATE game_config_buildings SET base_power_consumption = 500 WHERE id = 'galacticArmada';

-- 4. ADD rp_factory_t5_rate to game_config_game
ALTER TABLE game_config_game
  ADD COLUMN IF NOT EXISTS rp_factory_t5_rate NUMERIC NOT NULL DEFAULT 0.40;

-- 5. ADD 5 TIER-4.5 BUILDINGS (bridge dead-end supply chain)
INSERT INTO game_config_buildings (id, name, description, category, tier, base_cost, cost_multiplier, base_power_consumption, base_power_production, cycle_time, building_multiplier, base_production_rate, unlock_research, unlock_prestige, icon, sort_order)
VALUES ('arcologyModuleAssembler', 'Arcology Module Assembler', 'Assembles advanced arcology modules from structural components', 'factory', 4, '[{"amount": 1500000, "resource": "money"}]'::jsonb, 1.5, 80, 0, 60, 1.5, 0.04, 'megaConstruction', NULL, 'game-icons:city', 96)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_buildings (id, name, description, category, tier, base_cost, cost_multiplier, base_power_consumption, base_power_production, cycle_time, building_multiplier, base_production_rate, unlock_research, unlock_prestige, icon, sort_order)
VALUES ('stellarForgeModule', 'Stellar Forge Module', 'Forges stellar components from fusion energy and mega structures', 'factory', 4, '[{"amount": 2000000, "resource": "money"}]'::jsonb, 1.5, 150, 0, 80, 1.5, 0.03, 'antimatterPhysics', NULL, 'game-icons:star-swirl', 97)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_buildings (id, name, description, category, tier, base_cost, cost_multiplier, base_power_consumption, base_power_production, cycle_time, building_multiplier, base_production_rate, unlock_research, unlock_prestige, icon, sort_order)
VALUES ('voidEnergyCollector', 'Void Energy Collector', 'Harvests void energy from antimatter and quantum fluctuations', 'factory', 4, '[{"amount": 2500000, "resource": "money"}]'::jsonb, 1.5, 200, 0, 90, 1.5, 0.03, 'voidCrystallography', NULL, 'game-icons:void', 98)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_buildings (id, name, description, category, tier, base_cost, cost_multiplier, base_power_consumption, base_power_production, cycle_time, building_multiplier, base_production_rate, unlock_research, unlock_prestige, icon, sort_order)
VALUES ('tradeContractBroker', 'Trade Contract Broker', 'Brokerage that converts luxury goods into binding trade contracts', 'factory', 4, '[{"amount": 800000, "resource": "money"}]'::jsonb, 1.5, 40, 0, 40, 1.5, 0.06, 'megaConstruction', NULL, 'game-icons:scroll-quill', 99)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_buildings (id, name, description, category, tier, base_cost, cost_multiplier, base_power_consumption, base_power_production, cycle_time, building_multiplier, base_production_rate, unlock_research, unlock_prestige, icon, sort_order)
VALUES ('marketDominanceCenter', 'Market Dominance Center', 'Establishes market dominance through credit chips and trade contracts', 'factory', 4, '[{"amount": 1200000, "resource": "money"}]'::jsonb, 1.5, 60, 0, 50, 1.5, 0.04, 'megaConstruction', NULL, 'game-icons:crown', 100)
ON CONFLICT (id) DO NOTHING;

-- 6. INSERT RECIPES FOR THE 5 NEW TIER-4.5 BUILDINGS
-- recipe IDs start at recipe-300 to avoid collision (max existing is recipe-296)
--
-- Defensive: the production_recipes inserts reference building_id and
-- resource_id values that may not exist on the shadow DB used by
-- `db diff --linked --use-pg-schema`. The production_recipes table has
-- foreign keys to game_config_buildings and game_config_resources
-- (added by 009_game_config_tables.sql), so on the shadow DB the inserts
-- hit "violates foreign key constraint" because neither table has the
-- referenced rows (they are seeded via separate processes). Temporarily
-- drop the FKs for the inserts, then re-add them. On the linked
-- staging/prod databases the referenced rows already exist and the
-- re-added FKs validate cleanly.
SET session_replication_role = replica;
ALTER TABLE game_config_production_recipes
  DROP CONSTRAINT IF EXISTS game_config_production_recipes_building_id_fkey;
ALTER TABLE game_config_production_recipes
  DROP CONSTRAINT IF EXISTS game_config_production_recipes_resource_id_fkey;

INSERT INTO game_config_production_recipes (id, building_id, resource_id, is_input, amount) VALUES
  ('recipe-300', 'arcologyModuleAssembler', 'habitatModule', true, 1),
  ('recipe-301', 'arcologyModuleAssembler', 'structuralFrame', true, 1),
  ('recipe-302', 'arcologyModuleAssembler', 'arcologyModule', false, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_production_recipes (id, building_id, resource_id, is_input, amount) VALUES
  ('recipe-303', 'stellarForgeModule', 'fusionCell', true, 2),
  ('recipe-304', 'stellarForgeModule', 'megaStructure', true, 1),
  ('recipe-305', 'stellarForgeModule', 'stellarForge', false, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_production_recipes (id, building_id, resource_id, is_input, amount) VALUES
  ('recipe-306', 'voidEnergyCollector', 'antimatter', true, 1),
  ('recipe-307', 'voidEnergyCollector', 'quantumPart', true, 2),
  ('recipe-308', 'voidEnergyCollector', 'voidEnergy', false, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_production_recipes (id, building_id, resource_id, is_input, amount) VALUES
  ('recipe-309', 'tradeContractBroker', 'luxuryGoods', true, 2),
  ('recipe-310', 'tradeContractBroker', 'tradeContract', false, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_config_production_recipes (id, building_id, resource_id, is_input, amount) VALUES
  ('recipe-311', 'marketDominanceCenter', 'creditChip', true, 3),
  ('recipe-312', 'marketDominanceCenter', 'tradeContract', true, 2),
  ('recipe-313', 'marketDominanceCenter', 'marketDominance', false, 1)
ON CONFLICT (id) DO NOTHING;


-- Re-add the foreign keys (see defensive note above). Set session_replication_role
-- to origin first to allow FK validation against the local tables.
SET session_replication_role = origin;
ALTER TABLE game_config_production_recipes
  ADD CONSTRAINT game_config_production_recipes_building_id_fkey
  FOREIGN KEY (building_id) REFERENCES game_config_buildings(id) ON DELETE CASCADE
  NOT VALID;
ALTER TABLE game_config_production_recipes
  ADD CONSTRAINT game_config_production_recipes_resource_id_fkey
  FOREIGN KEY (resource_id) REFERENCES game_config_resources(id) ON DELETE CASCADE
  NOT VALID;
SET session_replication_role = default;

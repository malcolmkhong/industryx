-- ============================================================================
-- Migration: 009_game_config_tables
-- Description: Create all 19 game_config_* tables for disaster recovery
-- Purpose: These tables were created directly in the Supabase dashboard and had
--          no migration files. If the project is reset, all game data would be
--          lost. This migration provides a reproducible schema.
--
-- NOTE: This migration uses CREATE TABLE IF NOT EXISTS so it is safe to run
--       on an existing Supabase instance. It will NOT destroy any data.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- ============================================================================
-- 1. game_config_buildings (96 rows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  tier SMALLINT NOT NULL DEFAULT 0,
  base_cost JSONB NOT NULL DEFAULT '[]',
  cost_multiplier NUMERIC NOT NULL DEFAULT 1.15,
  base_power_consumption NUMERIC NOT NULL DEFAULT 0,
  base_power_production NUMERIC NOT NULL DEFAULT 0,
  cycle_time INTEGER NOT NULL DEFAULT 10,
  building_multiplier NUMERIC NOT NULL DEFAULT 1,
  base_production_rate NUMERIC,
  fuel TEXT,
  fuel_rate NUMERIC,
  unlock_research TEXT,
  unlock_prestige INTEGER,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcb_category ON game_config_buildings(category);
CREATE INDEX IF NOT EXISTS idx_gcb_tier ON game_config_buildings(tier);
CREATE INDEX IF NOT EXISTS idx_gcb_sort_order ON game_config_buildings(sort_order);

ALTER TABLE game_config_buildings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_buildings' AND policyname = 'Service role full access on game_config_buildings') THEN
    CREATE POLICY "Service role full access on game_config_buildings" ON game_config_buildings
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_buildings' AND policyname = 'Anyone can read game_config_buildings') THEN
    CREATE POLICY "Anyone can read game_config_buildings" ON game_config_buildings FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 2. game_config_resources (85 rows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  tier SMALLINT NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#ffffff',
  category TEXT NOT NULL DEFAULT 'standard',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcr_tier ON game_config_resources(tier);
CREATE INDEX IF NOT EXISTS idx_gcr_category ON game_config_resources(category);
CREATE INDEX IF NOT EXISTS idx_gcr_sort_order ON game_config_resources(sort_order);

ALTER TABLE game_config_resources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_resources' AND policyname = 'Service role full access on game_config_resources') THEN
    CREATE POLICY "Service role full access on game_config_resources" ON game_config_resources
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_resources' AND policyname = 'Anyone can read game_config_resources') THEN
    CREATE POLICY "Anyone can read game_config_resources" ON game_config_resources FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 3. game_config_production_recipes (297 rows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_production_recipes (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES game_config_buildings(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES game_config_resources(id) ON DELETE CASCADE,
  is_input BOOLEAN NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcpr_building_id ON game_config_production_recipes(building_id);
CREATE INDEX IF NOT EXISTS idx_gcpr_resource_id ON game_config_production_recipes(resource_id);

ALTER TABLE game_config_production_recipes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_production_recipes' AND policyname = 'Service role full access on game_config_production_recipes') THEN
    CREATE POLICY "Service role full access on game_config_production_recipes" ON game_config_production_recipes
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_production_recipes' AND policyname = 'Anyone can read game_config_production_recipes') THEN
    CREATE POLICY "Anyone can read game_config_production_recipes" ON game_config_production_recipes FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 4. game_config_production_chains
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_production_chains (
  id TEXT PRIMARY KEY,
  upstream_building TEXT NOT NULL REFERENCES game_config_buildings(id) ON DELETE CASCADE,
  downstream_building TEXT NOT NULL REFERENCES game_config_buildings(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES game_config_resources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcpc_upstream ON game_config_production_chains(upstream_building);
CREATE INDEX IF NOT EXISTS idx_gcpc_downstream ON game_config_production_chains(downstream_building);
CREATE INDEX IF NOT EXISTS idx_gcpc_resource ON game_config_production_chains(resource_id);

ALTER TABLE game_config_production_chains ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_production_chains' AND policyname = 'Service role full access on game_config_production_chains') THEN
    CREATE POLICY "Service role full access on game_config_production_chains" ON game_config_production_chains
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_production_chains' AND policyname = 'Anyone can read game_config_production_chains') THEN
    CREATE POLICY "Anyone can read game_config_production_chains" ON game_config_production_chains FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 5. game_config_research
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_research (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  tier SMALLINT NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL,
  time_required INTEGER NOT NULL,
  prerequisites JSONB NOT NULL DEFAULT '[]',
  effects JSONB NOT NULL DEFAULT '[]',
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcre_category ON game_config_research(category);
CREATE INDEX IF NOT EXISTS idx_gcre_tier ON game_config_research(tier);
CREATE INDEX IF NOT EXISTS idx_gcre_sort_order ON game_config_research(sort_order);

ALTER TABLE game_config_research ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_research' AND policyname = 'Service role full access on game_config_research') THEN
    CREATE POLICY "Service role full access on game_config_research" ON game_config_research
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_research' AND policyname = 'Anyone can read game_config_research') THEN
    CREATE POLICY "Anyone can read game_config_research" ON game_config_research FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 6. game_config_automation
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_automation (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cost INTEGER NOT NULL,
  requires_research TEXT,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gca_sort_order ON game_config_automation(sort_order);

ALTER TABLE game_config_automation ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_automation' AND policyname = 'Service role full access on game_config_automation') THEN
    CREATE POLICY "Service role full access on game_config_automation" ON game_config_automation
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_automation' AND policyname = 'Anyone can read game_config_automation') THEN
    CREATE POLICY "Anyone can read game_config_automation" ON game_config_automation FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 7. game_config_workers
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  base_hire_cost INTEGER NOT NULL,
  effects JSONB NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcw_sort_order ON game_config_workers(sort_order);

ALTER TABLE game_config_workers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_workers' AND policyname = 'Service role full access on game_config_workers') THEN
    CREATE POLICY "Service role full access on game_config_workers" ON game_config_workers
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_workers' AND policyname = 'Anyone can read game_config_workers') THEN
    CREATE POLICY "Anyone can read game_config_workers" ON game_config_workers FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 8. game_config_transport
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_transport (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  base_cost JSONB NOT NULL DEFAULT '[]',
  base_throughput NUMERIC NOT NULL,
  upgrade_multiplier NUMERIC NOT NULL DEFAULT 1.5,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gct_sort_order ON game_config_transport(sort_order);

ALTER TABLE game_config_transport ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_transport' AND policyname = 'Service role full access on game_config_transport') THEN
    CREATE POLICY "Service role full access on game_config_transport" ON game_config_transport
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_transport' AND policyname = 'Anyone can read game_config_transport') THEN
    CREATE POLICY "Anyone can read game_config_transport" ON game_config_transport FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 9. game_config_market
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_market (
  resource_id TEXT PRIMARY KEY REFERENCES game_config_resources(id) ON DELETE CASCADE,
  base_price NUMERIC NOT NULL,
  demand NUMERIC NOT NULL DEFAULT 1.0,
  supply NUMERIC NOT NULL DEFAULT 1.0,
  volatility NUMERIC NOT NULL DEFAULT 0.1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcm_sort_order ON game_config_market(sort_order);

ALTER TABLE game_config_market ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_market' AND policyname = 'Service role full access on game_config_market') THEN
    CREATE POLICY "Service role full access on game_config_market" ON game_config_market
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_market' AND policyname = 'Anyone can read game_config_market') THEN
    CREATE POLICY "Anyone can read game_config_market" ON game_config_market FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 10. game_config_prestige_bonuses
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_prestige_bonuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cost INTEGER NOT NULL,
  effect JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcpb_sort_order ON game_config_prestige_bonuses(sort_order);

ALTER TABLE game_config_prestige_bonuses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_prestige_bonuses' AND policyname = 'Service role full access on game_config_prestige_bonuses') THEN
    CREATE POLICY "Service role full access on game_config_prestige_bonuses" ON game_config_prestige_bonuses
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_prestige_bonuses' AND policyname = 'Anyone can read game_config_prestige_bonuses') THEN
    CREATE POLICY "Anyone can read game_config_prestige_bonuses" ON game_config_prestige_bonuses FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 11. game_config_rank_thresholds
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_rank_thresholds (
  rank SMALLINT PRIMARY KEY,
  name TEXT NOT NULL,
  score_required INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_config_rank_thresholds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_rank_thresholds' AND policyname = 'Service role full access on game_config_rank_thresholds') THEN
    CREATE POLICY "Service role full access on game_config_rank_thresholds" ON game_config_rank_thresholds
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_rank_thresholds' AND policyname = 'Anyone can read game_config_rank_thresholds') THEN
    CREATE POLICY "Anyone can read game_config_rank_thresholds" ON game_config_rank_thresholds FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 12. game_config_quest_definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_quest_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  game_tier SMALLINT DEFAULT 0,
  steps JSONB NOT NULL DEFAULT '[]',
  reward JSONB NOT NULL DEFAULT '{}',
  target_resource TEXT,
  target_building TEXT,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcqd_type ON game_config_quest_definitions(type);
CREATE INDEX IF NOT EXISTS idx_gcqd_category ON game_config_quest_definitions(category);
CREATE INDEX IF NOT EXISTS idx_gcqd_game_tier ON game_config_quest_definitions(game_tier);
CREATE INDEX IF NOT EXISTS idx_gcqd_sort_order ON game_config_quest_definitions(sort_order);

ALTER TABLE game_config_quest_definitions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_quest_definitions' AND policyname = 'Service role full access on game_config_quest_definitions') THEN
    CREATE POLICY "Service role full access on game_config_quest_definitions" ON game_config_quest_definitions
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_quest_definitions' AND policyname = 'Anyone can read game_config_quest_definitions') THEN
    CREATE POLICY "Anyone can read game_config_quest_definitions" ON game_config_quest_definitions FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 13. game_config_daily_rewards
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_daily_rewards (
  day SMALLINT PRIMARY KEY,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_config_daily_rewards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_daily_rewards' AND policyname = 'Service role full access on game_config_daily_rewards') THEN
    CREATE POLICY "Service role full access on game_config_daily_rewards" ON game_config_daily_rewards
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_daily_rewards' AND policyname = 'Anyone can read game_config_daily_rewards') THEN
    CREATE POLICY "Anyone can read game_config_daily_rewards" ON game_config_daily_rewards FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 14. game_config_event_templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_event_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  duration INTEGER NOT NULL,
  effects JSONB NOT NULL DEFAULT '[]',
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcet_type ON game_config_event_templates(type);
CREATE INDEX IF NOT EXISTS idx_gcet_sort_order ON game_config_event_templates(sort_order);

ALTER TABLE game_config_event_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_event_templates' AND policyname = 'Service role full access on game_config_event_templates') THEN
    CREATE POLICY "Service role full access on game_config_event_templates" ON game_config_event_templates
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_event_templates' AND policyname = 'Anyone can read game_config_event_templates') THEN
    CREATE POLICY "Anyone can read game_config_event_templates" ON game_config_event_templates FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 15. game_config_seasonal_events
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_seasonal_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  effects JSONB NOT NULL DEFAULT '[]',
  rewards JSONB NOT NULL DEFAULT '{}',
  icon TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcse_season ON game_config_seasonal_events(season);
CREATE INDEX IF NOT EXISTS idx_gcse_is_active ON game_config_seasonal_events(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_gcse_sort_order ON game_config_seasonal_events(sort_order);

ALTER TABLE game_config_seasonal_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_seasonal_events' AND policyname = 'Service role full access on game_config_seasonal_events') THEN
    CREATE POLICY "Service role full access on game_config_seasonal_events" ON game_config_seasonal_events
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_seasonal_events' AND policyname = 'Anyone can read game_config_seasonal_events') THEN
    CREATE POLICY "Anyone can read game_config_seasonal_events" ON game_config_seasonal_events FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 16. game_config_mega_projects
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_mega_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL,
  stages JSONB NOT NULL DEFAULT '[]',
  bonus JSONB NOT NULL DEFAULT '{}',
  unlock_requirement JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcmp_sort_order ON game_config_mega_projects(sort_order);

ALTER TABLE game_config_mega_projects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_mega_projects' AND policyname = 'Service role full access on game_config_mega_projects') THEN
    CREATE POLICY "Service role full access on game_config_mega_projects" ON game_config_mega_projects
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_mega_projects' AND policyname = 'Anyone can read game_config_mega_projects') THEN
    CREATE POLICY "Anyone can read game_config_mega_projects" ON game_config_mega_projects FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 17. game_config_game (single-row global config)
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_game (
  id TEXT PRIMARY KEY DEFAULT 'global',
  starting_money NUMERIC NOT NULL DEFAULT 1000,
  passive_rp_per_tick NUMERIC NOT NULL DEFAULT 0.5,
  base_payout_interval INTEGER NOT NULL DEFAULT 100,
  auto_sell_multiplier NUMERIC NOT NULL DEFAULT 0.9,
  min_power_efficiency NUMERIC NOT NULL DEFAULT 0.10,
  worker_power_reduction_cap NUMERIC NOT NULL DEFAULT 0.50,
  rp_extractor_rate NUMERIC NOT NULL DEFAULT 0.01,
  rp_power_rate NUMERIC NOT NULL DEFAULT 0.01,
  rp_factory_t1_rate NUMERIC NOT NULL DEFAULT 0.02,
  rp_factory_t2_rate NUMERIC NOT NULL DEFAULT 0.05,
  rp_factory_t3_rate NUMERIC NOT NULL DEFAULT 0.10,
  rp_factory_t4_rate NUMERIC NOT NULL DEFAULT 0.20,
  event_trigger_interval INTEGER NOT NULL DEFAULT 500,
  event_trigger_chance NUMERIC NOT NULL DEFAULT 0.60,
  max_concurrent_events INTEGER NOT NULL DEFAULT 2,
  worker_xp_rate NUMERIC NOT NULL DEFAULT 0.01,
  worker_levelup_xp_base INTEGER NOT NULL DEFAULT 100,
  t5_drain_rate NUMERIC NOT NULL DEFAULT 0.01,
  market_cycle_expansion_min INTEGER NOT NULL DEFAULT 300,
  market_cycle_expansion_max INTEGER NOT NULL DEFAULT 600,
  market_cycle_peak_min INTEGER NOT NULL DEFAULT 100,
  market_cycle_peak_max INTEGER NOT NULL DEFAULT 200,
  market_cycle_recession_min INTEGER NOT NULL DEFAULT 200,
  market_cycle_recession_max INTEGER NOT NULL DEFAULT 400,
  market_cycle_recovery_min INTEGER NOT NULL DEFAULT 150,
  market_cycle_recovery_max INTEGER NOT NULL DEFAULT 350,
  market_phase_expansion_mult NUMERIC NOT NULL DEFAULT 1.15,
  market_phase_peak_mult NUMERIC NOT NULL DEFAULT 1.30,
  market_phase_recession_mult NUMERIC NOT NULL DEFAULT 0.75,
  market_phase_recovery_mult NUMERIC NOT NULL DEFAULT 0.95,
  market_micro_event_chance NUMERIC NOT NULL DEFAULT 0.03,
  market_macro_event_chance NUMERIC NOT NULL DEFAULT 0.015,
  market_max_injection_effect NUMERIC NOT NULL DEFAULT 0.05,
  market_trade_decay_rate NUMERIC NOT NULL DEFAULT 0.80,
  market_mean_reversion_rate NUMERIC NOT NULL DEFAULT 0.03,
  market_price_lower_bound NUMERIC NOT NULL DEFAULT 0.20,
  market_price_upper_bound NUMERIC NOT NULL DEFAULT 5.00,
  save_version INTEGER NOT NULL DEFAULT 22,
  persist_throttle_ms INTEGER NOT NULL DEFAULT 2000,
  forced_save_ms INTEGER NOT NULL DEFAULT 10000,
  max_save_size_bytes INTEGER NOT NULL DEFAULT 4194304,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_config_game ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_game' AND policyname = 'Service role full access on game_config_game') THEN
    CREATE POLICY "Service role full access on game_config_game" ON game_config_game
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_game' AND policyname = 'Anyone can read game_config_game') THEN
    CREATE POLICY "Anyone can read game_config_game" ON game_config_game FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 18. game_config_weather
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_weather (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  production_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  solar_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  wind_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcw_sort_order ON game_config_weather(sort_order);

ALTER TABLE game_config_weather ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_weather' AND policyname = 'Service role full access on game_config_weather') THEN
    CREATE POLICY "Service role full access on game_config_weather" ON game_config_weather
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_weather' AND policyname = 'Anyone can read game_config_weather') THEN
    CREATE POLICY "Anyone can read game_config_weather" ON game_config_weather FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- 19. game_config_balancing_rules (currently 0 rows — ready for future use)
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_config_balancing_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  target TEXT,
  multiplier NUMERIC NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcbr_category ON game_config_balancing_rules(category);
CREATE INDEX IF NOT EXISTS idx_gcbr_target ON game_config_balancing_rules(target);
CREATE INDEX IF NOT EXISTS idx_gcbr_is_active ON game_config_balancing_rules(is_active) WHERE is_active = true;

ALTER TABLE game_config_balancing_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_balancing_rules' AND policyname = 'Service role full access on game_config_balancing_rules') THEN
    CREATE POLICY "Service role full access on game_config_balancing_rules" ON game_config_balancing_rules
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_config_balancing_rules' AND policyname = 'Anyone can read game_config_balancing_rules') THEN
    CREATE POLICY "Anyone can read game_config_balancing_rules" ON game_config_balancing_rules FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================================
-- Helper function: auto-update updated_at on row change
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to all tables with updated_at column
DO $$ BEGIN
  -- game_config_buildings
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcb_updated_at') THEN
    CREATE TRIGGER trg_gcb_updated_at BEFORE UPDATE ON game_config_buildings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_resources
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcr_updated_at') THEN
    CREATE TRIGGER trg_gcr_updated_at BEFORE UPDATE ON game_config_resources
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_research
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcre_updated_at') THEN
    CREATE TRIGGER trg_gcre_updated_at BEFORE UPDATE ON game_config_research
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_automation
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gca_updated_at') THEN
    CREATE TRIGGER trg_gca_updated_at BEFORE UPDATE ON game_config_automation
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_workers
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcw_updated_at') THEN
    CREATE TRIGGER trg_gcw_updated_at BEFORE UPDATE ON game_config_workers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_transport
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gct_updated_at') THEN
    CREATE TRIGGER trg_gct_updated_at BEFORE UPDATE ON game_config_transport
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_market
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcm_updated_at') THEN
    CREATE TRIGGER trg_gcm_updated_at BEFORE UPDATE ON game_config_market
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_prestige_bonuses
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcpb_updated_at') THEN
    CREATE TRIGGER trg_gcpb_updated_at BEFORE UPDATE ON game_config_prestige_bonuses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_quest_definitions
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcqd_updated_at') THEN
    CREATE TRIGGER trg_gcqd_updated_at BEFORE UPDATE ON game_config_quest_definitions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_daily_rewards
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcdr_updated_at') THEN
    CREATE TRIGGER trg_gcdr_updated_at BEFORE UPDATE ON game_config_daily_rewards
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_event_templates
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcet_updated_at') THEN
    CREATE TRIGGER trg_gcet_updated_at BEFORE UPDATE ON game_config_event_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_seasonal_events
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcse_updated_at') THEN
    CREATE TRIGGER trg_gcse_updated_at BEFORE UPDATE ON game_config_seasonal_events
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_mega_projects
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcmp_updated_at') THEN
    CREATE TRIGGER trg_gcmp_updated_at BEFORE UPDATE ON game_config_mega_projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_game
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcg_updated_at') THEN
    CREATE TRIGGER trg_gcg_updated_at BEFORE UPDATE ON game_config_game
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_weather
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcw_updated_at') THEN
    CREATE TRIGGER trg_gcw_updated_at BEFORE UPDATE ON game_config_weather
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- game_config_balancing_rules
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcbr_updated_at') THEN
    CREATE TRIGGER trg_gcbr_updated_at BEFORE UPDATE ON game_config_balancing_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ============================================================================
-- DONE! Summary of what was created:
-- ============================================================================
--
-- TABLES (19):
--   game_config_buildings          — 20 columns, PK: id (text)
--   game_config_resources          — 9 columns, PK: id (text)
--   game_config_production_recipes — 6 columns, PK: id (text), FKs: buildings, resources
--   game_config_production_chains  — 5 columns, PK: id (text), FKs: buildings, resources
--   game_config_research           — 13 columns, PK: id (text)
--   game_config_automation         — 9 columns, PK: id (text)
--   game_config_workers            — 9 columns, PK: id (text)
--   game_config_transport          — 10 columns, PK: id (text)
--   game_config_market             — 8 columns, PK: resource_id (text), FK: resources
--   game_config_prestige_bonuses   — 8 columns, PK: id (text)
--   game_config_rank_thresholds    — 4 columns, PK: rank (smallint)
--   game_config_quest_definitions  — 14 columns, PK: id (text)
--   game_config_daily_rewards      — 6 columns, PK: day (smallint)
--   game_config_event_templates    — 10 columns, PK: id (text)
--   game_config_seasonal_events    — 13 columns, PK: id (text)
--   game_config_mega_projects      — 10 columns, PK: id (text)
--   game_config_game               — 44 columns, PK: id (text), default 'global'
--   game_config_weather            — 10 columns, PK: id (text)
--   game_config_balancing_rules    — 11 columns, PK: id (text)
--
-- INDEXES: Created for sort_order, category, tier, and frequently queried columns
--
-- RLS POLICIES:
--   - Service role: full access (USING auth.role() = 'service_role')
--   - Public: read-only (USING true) — game configs are public data
--
-- TRIGGERS:
--   - Auto-update updated_at on row change for 15 tables
--
-- FOREIGN KEYS:
--   - production_recipes.building_id → buildings.id
--   - production_recipes.resource_id → resources.id
--   - production_chains.upstream_building → buildings.id
--   - production_chains.downstream_building → buildings.id
--   - production_chains.resource_id → resources.id
--   - market.resource_id → resources.id
--
-- ============================================================================

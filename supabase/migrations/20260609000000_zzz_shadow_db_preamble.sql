-- ============================================================================
-- Shadow-DB safety preamble
--
-- Purpose: many legacy migration files in this folder were created with
-- ad-hoc timestamps that do not reflect their actual dependency order. As a
-- result, files like 20260611114348_tradable_resources.sql reference
-- game_config_market (created by 20260622141113_009_game_config_tables.sql)
-- but the Supabase CLI shadow database used by
-- `db diff --linked --use-pg-schema` replays every migration alphabetically,
-- causing the shadow replay to fail with "relation does not exist" on the
-- first migration that references a not-yet-created table.
--
-- This preamble runs first (timestamp 20260609000000, before any other file).
-- It idempotently creates every table referenced by early migrations so the
-- shadow DB replay succeeds. On the linked staging/production databases
-- these are all no-ops because the tables already exist with the same shape
-- (the canonical schemas live in the same-named later files).
--
-- DO NOT add new DDL here unless a shadow-DB replay error specifically
-- requires it. The real canonical schema lives in 2026062214111*.sql.
-- ============================================================================


-- ─── Game config tables (canonical schema mirrors 009_game_config_tables.sql) ───
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

CREATE TABLE IF NOT EXISTS game_config_market (
  resource_id TEXT PRIMARY KEY,
  base_price NUMERIC NOT NULL,
  demand NUMERIC NOT NULL DEFAULT 1.0,
  supply NUMERIC NOT NULL DEFAULT 1.0,
  volatility NUMERIC NOT NULL DEFAULT 0.1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_config_market_history (
  id BIGSERIAL PRIMARY KEY,
  resource_id TEXT NOT NULL,
  base_price NUMERIC NOT NULL,
  market_phase TEXT,
  game_tick BIGINT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS game_config_rank_thresholds (
  rank SMALLINT PRIMARY KEY,
  name TEXT NOT NULL,
  score_required INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS game_config_daily_rewards (
  day SMALLINT PRIMARY KEY,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS game_config_game (
  id TEXT PRIMARY KEY DEFAULT 'global',
  starting_money NUMERIC NOT NULL DEFAULT 1000,
  passive_rp_per_tick NUMERIC NOT NULL DEFAULT 0.5,
  save_version INTEGER NOT NULL DEFAULT 22,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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


-- ─── Core gameplay tables (canonical schemas live in 003/004/etc.) ───
-- Note: server_* tables are created without FKs to auth.users to avoid
-- shadow-DB dependencies on the auth schema (which is not replicated).
CREATE TABLE IF NOT EXISTS server_game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_state JSONB NOT NULL DEFAULT '{}',
  money NUMERIC NOT NULL DEFAULT 1000,
  total_money_earned NUMERIC NOT NULL DEFAULT 0,
  research_points NUMERIC NOT NULL DEFAULT 0,
  buildings JSONB NOT NULL DEFAULT '[]',
  buildings_count INT NOT NULL DEFAULT 0,
  completed_research JSONB NOT NULL DEFAULT '[]',
  resources JSONB NOT NULL DEFAULT '{}',
  workers JSONB NOT NULL DEFAULT '[]',
  game_tick BIGINT NOT NULL DEFAULT 0,
  game_speed INT NOT NULL DEFAULT 1,
  state_hash TEXT NOT NULL DEFAULT '',
  state_version INT NOT NULL DEFAULT 1,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cheat_flag_count INT NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  lock_reason TEXT,
  market_supply JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_trade_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS server_market_state (
  id INT PRIMARY KEY,
  tick BIGINT NOT NULL DEFAULT 0,
  prices JSONB NOT NULL DEFAULT '[]',
  news JSONB NOT NULL DEFAULT '[]',
  volatility JSONB NOT NULL DEFAULT '{}',
  base_prices JSONB NOT NULL DEFAULT '[]',
  circuit_breakers JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_player_pressure (
  resource TEXT,
  user_id UUID,
  buy_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  sell_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Auth & user tables (no FKs to auth schema in shadow) ───
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  season_id TEXT DEFAULT 'S1',
  session_count INTEGER DEFAULT 0,
  last_active TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  is_guest BOOLEAN NOT NULL DEFAULT TRUE,
  device_fingerprint TEXT,
  linked_account_id UUID,
  linked_at TIMESTAMPTZ,
  display_name TEXT,
  is_test BOOLEAN NOT NULL DEFAULT false,
  fingerprint_status TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.guest_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  user_id UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_by UUID,
  superseded_at TIMESTAMPTZ,
  device_id TEXT,
  fingerprint_hash TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  target_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  details JSONB NOT NULL DEFAULT '{}',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cheat_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.pending_link_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id UUID NOT NULL,
  google_user_id UUID,
  target_auth_user_id UUID,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_hash TEXT,
  ip_region TEXT,
  user_agent TEXT,
  risk_score INTEGER DEFAULT 0,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  preference TEXT,
  preview_version JSONB,
  merge_result JSONB,
  confirmed_email TEXT,
  merge_policy TEXT NOT NULL DEFAULT 'auth_wins_archive_guest',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  conflict_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.merge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT,
  merge_receipt_id TEXT,
  idempotency_key TEXT,
  guest_user_id UUID,
  google_user_id UUID,
  auth_user_id UUID,
  preference TEXT,
  guest_state_before JSONB,
  google_state_before JSONB,
  guest_state_after JSONB,
  google_state_after JSONB,
  merge_result JSONB,
  preview_version JSONB,
  result TEXT,
  risk_score INTEGER DEFAULT 0,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  actor_user_id UUID,
  actor_ip_hash TEXT,
  actor_ip_region TEXT,
  actor_user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.merge_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID,
  merge_audit_id UUID,
  kept_user_id UUID,
  surviving_user_id UUID,
  archived_user_id UUID,
  archived_guest_id UUID,
  decision_type TEXT,
  guest_state_snapshot JSONB,
  google_state_snapshot JSONB,
  risk_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.request_ip_log (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_id UUID,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_admin UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  sender_id UUID,
  sender_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'capacity_block',
  status TEXT NOT NULL DEFAULT 'pending',
  ticket_id UUID,
  invited_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Rate limits (16_rate_limits.sql) ───
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('minute', NOW()),
  request_count INTEGER NOT NULL DEFAULT 1
);


-- ─── Trade history (008_trade_history.sql) ───
CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  give_resource TEXT,
  give_amount NUMERIC,
  receive_resource TEXT,
  receive_amount NUMERIC,
  commission_rate NUMERIC,
  server_validated BOOLEAN,
  market_phase TEXT,
  game_tick BIGINT,
  resource_id TEXT,
  side TEXT,
  quantity INTEGER,
  unit_price NUMERIC,
  total NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Helper functions that early migrations REVOKE/GRANT ───
-- Note: stub functions are NOT added here because creating them with
-- signatures that conflict with later canonical CREATE OR REPLACE
-- statements causes "function name is not unique" errors. Instead, the
-- REVOKE/GRANT blocks in 049_lockdown_security_rpcs.sql and similar
-- files are wrapped with existence guards in their own migrations.

-- Migration 019: Drop duplicate updated_at triggers
--
-- Each game_config_* table has TWO triggers firing on UPDATE:
--   set_updated_at        -> auto_update_timestamp()
--   trg_gcX_updated_at    -> update_updated_at_column()
--
-- Both do the same thing (set NEW.updated_at = now()). Keep one, drop the other.
-- Keep: set_updated_at (uses auto_update_timestamp)
-- Drop: trg_gcX_updated_at (uses update_updated_at_column)

-- Drop triggers from all game_config_* tables
DROP TRIGGER IF EXISTS trg_gca_updated_at ON game_config_automation;
DROP TRIGGER IF EXISTS trg_gcbr_updated_at ON game_config_balancing_rules;
DROP TRIGGER IF EXISTS trg_gcb_updated_at ON game_config_buildings;
DROP TRIGGER IF EXISTS trg_gcdr_updated_at ON game_config_daily_rewards;
DROP TRIGGER IF EXISTS trg_gcet_updated_at ON game_config_event_templates;
DROP TRIGGER IF EXISTS trg_gcg_updated_at ON game_config_game;
DROP TRIGGER IF EXISTS trg_gcm_updated_at ON game_config_market;
DROP TRIGGER IF EXISTS trg_gcmp_updated_at ON game_config_mega_projects;
DROP TRIGGER IF EXISTS trg_gcpb_updated_at ON game_config_prestige_bonuses;
DROP TRIGGER IF EXISTS trg_gcqd_updated_at ON game_config_quest_definitions;
DROP TRIGGER IF EXISTS trg_gcre_updated_at ON game_config_research;
DROP TRIGGER IF EXISTS trg_gcr_updated_at ON game_config_resources;
DROP TRIGGER IF EXISTS trg_gcse_updated_at ON game_config_seasonal_events;
DROP TRIGGER IF EXISTS trg_gct_updated_at ON game_config_transport;
DROP TRIGGER IF EXISTS trg_gcw_updated_at ON game_config_workers;

-- Note: update_updated_at_column() function is kept (harmless, no triggers reference it now)
-- auto_update_timestamp() is the active function going forward

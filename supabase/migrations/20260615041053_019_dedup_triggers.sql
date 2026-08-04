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
--
-- Defensive: DROP TRIGGER IF EXISTS only suppresses the missing-trigger
-- error, not the missing-table error. The shadow DB used by
-- `db diff --linked --use-pg-schema` replays in alphabetical order, so
-- at this point the game_config_* tables may not exist yet (they are
-- created by 20260622141113_009_game_config_tables.sql). Wrap each drop
-- in a to_regclass existence check so the migration is safe in any
-- replay context. On the linked staging/prod databases the tables
-- already exist and this is equivalent to the original DROP TRIGGER
-- statement.
DO $drop_trg$
BEGIN
  IF to_regclass('game_config_automation') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gca_updated_at ON game_config_automation';
  END IF;
  IF to_regclass('game_config_balancing_rules') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcbr_updated_at ON game_config_balancing_rules';
  END IF;
  IF to_regclass('game_config_buildings') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcb_updated_at ON game_config_buildings';
  END IF;
  IF to_regclass('game_config_daily_rewards') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcdr_updated_at ON game_config_daily_rewards';
  END IF;
  IF to_regclass('game_config_event_templates') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcet_updated_at ON game_config_event_templates';
  END IF;
  IF to_regclass('game_config_game') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcg_updated_at ON game_config_game';
  END IF;
  IF to_regclass('game_config_market') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcm_updated_at ON game_config_market';
  END IF;
  IF to_regclass('game_config_mega_projects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcmp_updated_at ON game_config_mega_projects';
  END IF;
  IF to_regclass('game_config_prestige_bonuses') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcpb_updated_at ON game_config_prestige_bonuses';
  END IF;
  IF to_regclass('game_config_quest_definitions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcqd_updated_at ON game_config_quest_definitions';
  END IF;
  IF to_regclass('game_config_research') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcre_updated_at ON game_config_research';
  END IF;
  IF to_regclass('game_config_resources') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcr_updated_at ON game_config_resources';
  END IF;
  IF to_regclass('game_config_seasonal_events') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcse_updated_at ON game_config_seasonal_events';
  END IF;
  IF to_regclass('game_config_transport') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gct_updated_at ON game_config_transport';
  END IF;
  IF to_regclass('game_config_workers') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_gcw_updated_at ON game_config_workers';
  END IF;
END
$drop_trg$;

-- Note: update_updated_at_column() function is kept (harmless, no triggers reference it now)
-- auto_update_timestamp() is the active function going forward

-- ============================================================================
-- Migration: 005_lean_mvp_cleanup
-- Description: Remove unnecessary fields identified in tracking audit
-- Purpose: Reduce storage, bandwidth, and write frequency for Supabase free tier
--
-- CHANGES:
--   1. DROP validated_actions table (storage bomb + 80% redundant with player_actions)
--   2. Slim player_progress to backwards-compat only (remove all duplicate columns)
--   3. Add validation_risk to player_actions, remove client_ip/user_agent/money_before
--   4. Slim cheat_investigations (remove dead columns never written by code)
--   5. Slim player_sessions (remove session_token dead code + PII)
--   6. Update DB functions that reference dropped columns
--   7. Drop trigger that references dropped player_progress columns
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================


-- ============================================================================
-- PART 1: DROP validated_actions table
-- Reason: 80% duplicate of player_actions. state_before/state_after JSONB
--         columns consume ~50MB/day for 50 users (500MB free tier in 10 days).
--         The status field is always "validated" (synchronous validation).
-- ============================================================================

DROP TABLE IF EXISTS validated_actions CASCADE;


-- ============================================================================
-- PART 2: Drop trigger that references columns being removed from player_progress
-- Reason: The trigger checks NEW.is_locked, NEW.server_game_tick, NEW.money
--         — all columns being dropped. Validation now happens in API routes
--         via validateGameState() against server_game_state (source of truth).
-- ============================================================================

DROP TRIGGER IF EXISTS trg_validate_player_save ON player_progress;
DROP FUNCTION IF EXISTS validate_player_save();


-- ============================================================================
-- PART 3: Slim player_progress — remove all duplicate columns
-- Reason: server_game_state is now the source of truth. player_progress
--         is kept as a thin backwards-compat fallback with only:
--         user_id (PK), display_name, game_state
-- ============================================================================

-- Drop columns added by migration 004 (all duplicates of server_game_state)
ALTER TABLE player_progress DROP COLUMN IF EXISTS validated_state_hash;
ALTER TABLE player_progress DROP COLUMN IF EXISTS last_validated_tick;
ALTER TABLE player_progress DROP COLUMN IF EXISTS cheat_flag_count;
ALTER TABLE player_progress DROP COLUMN IF EXISTS is_locked;
ALTER TABLE player_progress DROP COLUMN IF EXISTS lock_reason;

-- Drop columns added by migration 003 (duplicates of server_game_state)
ALTER TABLE player_progress DROP COLUMN IF EXISTS last_server_tick_at;
ALTER TABLE player_progress DROP COLUMN IF EXISTS server_game_tick;
ALTER TABLE player_progress DROP COLUMN IF EXISTS save_checksum;

-- Drop columns added by migration 001 (duplicates of server_game_state)
ALTER TABLE player_progress DROP COLUMN IF EXISTS last_saved_at;
ALTER TABLE player_progress DROP COLUMN IF EXISTS buildings_count;
ALTER TABLE player_progress DROP COLUMN IF EXISTS game_tick;

-- Drop pre-existing columns that duplicate server_game_state
-- (money, total_money_earned, resources, buildings existed before migration 001)
ALTER TABLE player_progress DROP COLUMN IF EXISTS money;
ALTER TABLE player_progress DROP COLUMN IF EXISTS total_money_earned;
ALTER TABLE player_progress DROP COLUMN IF EXISTS resources;
ALTER TABLE player_progress DROP COLUMN IF EXISTS buildings;

-- Remove indexes that reference dropped columns
DROP INDEX IF EXISTS idx_player_progress_last_server_tick;


-- ============================================================================
-- PART 4: Slim player_actions — remove PII + redundant, add validation_risk
-- Reason: client_ip/user_agent are PII liability with near-zero anti-cheat
--         value. money_before is derivable from previous row's money_after.
--         validation_risk is the one useful field from validated_actions.
-- ============================================================================

-- Add validation_risk column (from validated_actions, the one field worth keeping)
ALTER TABLE player_actions ADD COLUMN IF NOT EXISTS validation_risk TEXT
  DEFAULT 'none' CHECK (validation_risk IN ('none', 'low', 'medium', 'high', 'critical'));

-- Drop PII columns
ALTER TABLE player_actions DROP COLUMN IF EXISTS client_ip;
ALTER TABLE player_actions DROP COLUMN IF EXISTS user_agent;

-- Drop redundant money_before (derivable from previous row's money_after)
ALTER TABLE player_actions DROP COLUMN IF EXISTS money_before;


-- ============================================================================
-- PART 5: Slim cheat_investigations — remove dead columns
-- Reason: expected_value/actual_value never populated by code.
--         resolved_by/resolution_note/resolved_at require admin panel
--         that doesn't exist yet. Add back when building admin panel.
-- ============================================================================

ALTER TABLE cheat_investigations DROP COLUMN IF EXISTS expected_value;
ALTER TABLE cheat_investigations DROP COLUMN IF EXISTS actual_value;
ALTER TABLE cheat_investigations DROP COLUMN IF EXISTS resolved_by;
ALTER TABLE cheat_investigations DROP COLUMN IF EXISTS resolution_note;
ALTER TABLE cheat_investigations DROP COLUMN IF EXISTS resolved_at;


-- ============================================================================
-- PART 6: Slim player_sessions — remove dead code + PII
-- Reason: session_token never written by any code (dead column).
--         client_ip/user_agent are PII with no anti-cheat value.
-- ============================================================================

ALTER TABLE player_sessions DROP COLUMN IF EXISTS session_token;
ALTER TABLE player_sessions DROP COLUMN IF EXISTS client_ip;
ALTER TABLE player_sessions DROP COLUMN IF EXISTS user_agent;


-- ============================================================================
-- PART 7: Update DB functions that reference dropped columns
-- ============================================================================

-- Update increment_cheat_flag: only update server_game_state now
-- (previously updated both player_progress and server_game_state)
CREATE OR REPLACE FUNCTION increment_cheat_flag(
  p_user_id UUID,
  p_flag_type TEXT,
  p_description TEXT,
  p_severity TEXT
)
RETURNS VOID AS $$
DECLARE
  v_new_count INT;
  v_threshold INT := 3; -- Lock after 3 flags
BEGIN
  -- Increment flag count on server_game_state ONLY (source of truth)
  UPDATE server_game_state
  SET cheat_flag_count = cheat_flag_count + 1
  WHERE user_id = p_user_id
  RETURNING cheat_flag_count INTO v_new_count;

  -- Log the investigation
  INSERT INTO cheat_investigations (user_id, detection_type, severity, description)
  VALUES (p_user_id, p_flag_type, p_severity, p_description);

  -- Auto-lock if threshold reached
  IF v_new_count >= v_threshold THEN
    PERFORM lock_cheater_account(p_user_id, 'Auto-locked after ' || v_new_count || ' cheat flags');
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Update lock_cheater_account: only update server_game_state now
CREATE OR REPLACE FUNCTION lock_cheater_account(
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Lock server_game_state ONLY (source of truth)
  UPDATE server_game_state
  SET is_locked = true,
      lock_reason = p_reason
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- DONE! Summary of what was changed:
-- ============================================================================
--
-- DROPPED TABLES:
--   validated_actions → Storage bomb removed
--
-- DROPPED TRIGGERS:
--   trg_validate_player_save → References dropped columns
--
-- DROPPED FUNCTIONS:
--   validate_player_save() → No longer needed (validation in API routes)
--
-- player_progress SLIMMED (12 columns dropped):
--   Removed: money, total_money_earned, resources, buildings,
--            last_saved_at, buildings_count, game_tick,
--            last_server_tick_at, server_game_tick, save_checksum,
--            validated_state_hash, last_validated_tick,
--            cheat_flag_count, is_locked, lock_reason
--   Remaining: user_id (PK), display_name, game_state
--
-- player_actions UPDATED:
--   Removed: client_ip, user_agent, money_before
--   Added: validation_risk TEXT (CHECK none/low/medium/high/critical)
--
-- cheat_investigations SLIMMED (5 columns dropped):
--   Removed: expected_value, actual_value, resolved_by,
--            resolution_note, resolved_at
--
-- player_sessions SLIMMED (3 columns dropped):
--   Removed: session_token, client_ip, user_agent
--
-- DB FUNCTIONS UPDATED:
--   increment_cheat_flag() → Only updates server_game_state
--   lock_cheater_account() → Only updates server_game_state
--
-- ============================================================================

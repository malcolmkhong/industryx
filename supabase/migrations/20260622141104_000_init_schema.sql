-- 000_init_schema.sql
-- Base schema for local Supabase. The original `player_progress` table was
-- created via the Supabase API in the early project, not via migrations.
-- Migrations 001-005 then add/drop columns on top of this base.
--
-- For a fresh local DB (`supabase start`), this file creates the table so
-- migrations 001-005 can run. For existing cloud deployments, the
-- `IF NOT EXISTS` makes this a no-op.
--
-- The slim final shape (after migration 005) is just:
--   user_id (PK), display_name, game_state
-- This file creates the wider pre-cleanup shape so all intermediate
-- migrations can run without errors.

CREATE TABLE IF NOT EXISTS player_progress (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name         TEXT DEFAULT 'Commander',
  game_state           JSONB DEFAULT '{}',
  money                NUMERIC DEFAULT 0,
  resources            JSONB DEFAULT '{}',
  buildings            JSONB DEFAULT '{}',
  is_locked            BOOLEAN DEFAULT false,
  server_game_tick     BIGINT DEFAULT 0,
  cheat_flag_count     INT DEFAULT 0,
  validated_state_hash TEXT,
  last_validated_tick  BIGINT,
  last_saved_at        TIMESTAMPTZ DEFAULT NOW(),
  buildings_count      INT DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- NOTE: RLS enable + policy creation are handled by migration 001.
-- Don't duplicate them here or migration 001 will fail with "policy already exists".

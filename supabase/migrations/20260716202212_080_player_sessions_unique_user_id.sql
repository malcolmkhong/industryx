-- ============================================================================
-- Migration: 080_player_sessions_unique_user_id
-- Description: Enforce UNIQUE on player_sessions.user_id so that the heartbeat
--              endpoint's upsert (`ON CONFLICT (user_id)`) can succeed.
-- Bug:        BUG-080 (2026-07-16) — heartbeat log "there is no unique or
--              exclusion constraint matching the ON CONFLICT specification"
--              (Postgres 42P10) caused player_sessions row to never be written.
--              Migration 003 only created a non-unique btree index.
-- Safety:     Dedupe CTE keeps the most recent heartbeat per user (by
--              last_heartbeat_at DESC, then created_at DESC, then id DESC).
--              On the current production table (0 rows as of 2026-07-16) this
--              is a no-op. On re-run with future dupes it remains idempotent.
-- ============================================================================

-- Step 1: Dedupe — keep most recent row per user_id, delete the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY last_heartbeat_at DESC NULLS LAST,
                    created_at DESC,
                    id DESC
         ) AS rn
  FROM player_sessions
)
DELETE FROM player_sessions
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Enforce uniqueness via a UNIQUE INDEX (preferred over CONSTRAINT:
--         supports `IF NOT EXISTS`, lower lock footprint, identical ON CONFLICT
--         compatibility).
CREATE UNIQUE INDEX IF NOT EXISTS player_sessions_user_id_key
  ON player_sessions (user_id);

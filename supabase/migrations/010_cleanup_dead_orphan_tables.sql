-- ============================================================================
-- Migration: 010_cleanup_dead_orphan_tables
-- Description: Remove dead/redundant tables and clean up orphan tables
--
-- CHANGES:
--   1. DROP research_prerequisites table (dead entry — never queried by code)
--   2. DROP game_saves table (orphan — no code references)
--   3. DROP guest_profiles table (orphan — no code references)
--   4. DROP messages table (orphan — no code references)
--   5. DROP user_profiles table (orphan — no code references)
--   6. KEEP profiles table (Supabase Auth companion — may be auto-created)
--
-- BACKGROUND:
--   research_prerequisites was created in migration 004 and seeded from
--   game_config_research.prerequisites. However, NO code ever queries this
--   table — research prerequisite validation is done entirely in TypeScript.
--   This creates a maintenance burden: if new research is added, the
--   JSONB field AND this table must both be updated, or they'll go out of sync.
--
--   The 4 orphan tables (game_saves, guest_profiles, messages, user_profiles)
--   have zero code references and appear to be leftover from early development.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- 1. Drop research_prerequisites (dead table)
DROP TABLE IF EXISTS research_prerequisites;

-- 2. Drop orphan tables with no code references
DROP TABLE IF EXISTS game_saves;
DROP TABLE IF EXISTS guest_profiles;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS user_profiles;

-- NOTE: `profiles` table is NOT dropped — it may be a Supabase Auth
-- companion table (auto-created with auth.users). Dropping it could
-- break Supabase Auth triggers. Verify before dropping.

-- ============================================================================
-- DONE! Summary:
--   DROPPED: research_prerequisites (44 rows — dead, never queried)
--   DROPPED: game_saves (0 rows — orphan)
--   DROPPED: guest_profiles (15 rows — orphan)
--   DROPPED: messages (6 rows — orphan)
--   DROPPED: user_profiles (2 rows — orphan)
--   KEPT:    profiles (1 row — Supabase Auth companion)
-- ============================================================================

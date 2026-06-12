-- ============================================================================
-- Migration: 017_security_hardening_and_cleanup
-- Description: Security hardening + dead schema cleanup
--
-- CHANGES:
--   1. Apply deferred migration 010 — drop 5 orphan tables (zero code refs)
--   2. Lock down increment_cheat_flag — the only real attack surface
--   3. Drop 2 truly dead SECURITY DEFINER functions
--   4. Defense in depth — tighten grants on all remaining SECURITY DEFINER funcs
--
-- BACKGROUND:
--   - Migration 010_cleanup_dead_orphan_tables.sql was authored but never
--     applied. The 5 tables (guest_profiles, game_saves, messages,
--     user_profiles, research_prerequisites) have no app code references.
--   - increment_cheat_flag is SECURITY DEFINER and originally had
--     GRANT EXECUTE TO authenticated. Any logged-in user could call it
--     from the browser to flag OTHER users' accounts. App code never calls
--     it yet (TODO at src/lib/auth/gameStateValidator.ts:394).
--   - The other SECURITY DEFINER functions have public execute by default;
--     tightening them prevents accidental exposure.
--
-- KEPT (not dropped):
--   - is_game_admin: used by RLS policies (cannot drop)
--   - handle_new_user: bound to on_auth_user_created trigger on auth.users
--   - rls_auto_enable: bound to ensure_rls event trigger (Supabase infra)
--   - check_rate_limit: used by src/lib/auth/rateLimiter.ts via service role
--   - cleanup_rate_limits: called by pg_cron
--
-- DROPPED (truly dead — no callers anywhere):
--   - increment_save_version
--   - purge_stale_guest_profiles
--
-- This migration is idempotent — safe to re-run.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Drop 5 orphan tables (deferred from migration 010)
-- ────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.guest_profiles CASCADE;
DROP TABLE IF EXISTS public.game_saves CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.research_prerequisites CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Lock down increment_cheat_flag — the only real attack surface
-- ────────────────────────────────────────────────────────────────────────────
-- Function takes a p_user_id parameter and has no auth.uid() check.
-- With GRANT EXECUTE TO authenticated, any logged-in user could flag
-- other users' accounts (account lockout attack at 3 flags).
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text, integer) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Drop 2 truly dead SECURITY DEFINER functions (no callers anywhere)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.increment_save_version();
DROP FUNCTION IF EXISTS public.purge_stale_guest_profiles(integer);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Defense in depth — tighten grants on remaining SECURITY DEFINER funcs
-- ────────────────────────────────────────────────────────────────────────────
-- check_rate_limit: app calls via service role only
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;

-- cleanup_rate_limits: called by pg_cron (runs as postgres, bypasses grants)
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits(interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits(interval) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits(interval) TO service_role;

-- is_game_admin: called by RLS policies (bypasses EXECUTE grants during policy check)
REVOKE EXECUTE ON FUNCTION public.is_game_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_game_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_game_admin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_game_admin() TO service_role;

-- handle_new_user: called by on_auth_user_created trigger (bypasses EXECUTE grants)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- rls_auto_enable: called by ensure_rls event trigger (bypasses EXECUTE grants)
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

COMMIT;

-- ============================================================================
-- VERIFY after running:
--   1. SELECT tablename FROM pg_tables WHERE schemaname='public'
--      AND tablename IN ('guest_profiles','game_saves','messages',
--                        'user_profiles','research_prerequisites');
--      → expect 0 rows
--   2. SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
--      WHERE n.nspname='public' AND p.prosecdef=true
--      AND proname IN ('increment_save_version','purge_stale_guest_profiles');
--      → expect 0 rows
--   3. SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
--                has_function_privilege('authenticated', oid, 'EXECUTE') AS auth,
--                has_function_privilege('service_role', oid, 'EXECUTE') AS svc
--      FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
--      WHERE n.nspname='public' AND p.prosecdef=true;
--      → expect all rows: anon=false, auth=false, svc=true
--   4. SELECT trigger_name, function_name FROM information_schema.triggers
--      WHERE event_object_schema='auth' AND event_object_table='users';
--      → expect on_auth_user_created → handle_new_user (still enabled)
-- ============================================================================

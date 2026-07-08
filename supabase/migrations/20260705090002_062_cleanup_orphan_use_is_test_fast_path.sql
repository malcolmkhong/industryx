-- 062_cleanup_orphan_use_is_test_fast_path.sql
-- Tier 2 fix 5 (cont): test/development accounts are cleaned after 1 day
-- of inactivity (vs 30 days for real guest accounts). This prevents
-- test suites from accumulating hundreds of accounts before the regular
-- 30-day window expires.
--
-- is_test column was added in migration 060. quickstart route detects
-- the deviceId pattern (it-*, fp-test-*, recover-test-*, etc.) and sets
-- is_test=true on the profile.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.cleanup_orphan_anon_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test_count    integer := 0;
  v_regular_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'cleanup_orphan_anon_users requires service_role';
  END IF;

  -- Phase 1: test/development accounts — 1 day, no game state, no identity.
  WITH test_orphans AS (
    SELECT u.id
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.is_anonymous = true
      AND p.is_test = true
      AND COALESCE(p.last_active, u.created_at) < now() - interval '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.guest_identities gi WHERE gi.user_id = u.id
      )
  )
  DELETE FROM auth.users
  WHERE id IN (SELECT id FROM test_orphans);
  GET DIAGNOSTICS v_test_count = ROW_COUNT;

  -- Phase 2: regular guest accounts — 30 days, no game state, no identity.
  WITH regular_orphans AS (
    SELECT u.id
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.is_anonymous = true
      AND COALESCE(p.is_test, false) = false
      AND u.created_at < now() - interval '30 days'
      AND COALESCE(p.last_active, u.created_at) < now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.guest_identities gi WHERE gi.user_id = u.id
      )
  )
  DELETE FROM auth.users
  WHERE id IN (SELECT id FROM regular_orphans);
  GET DIAGNOSTICS v_regular_count = ROW_COUNT;

  IF v_test_count > 0 OR v_regular_count > 0 THEN
    RAISE NOTICE 'cleanup_orphan_anon_users: deleted % test + % regular accounts',
      v_test_count, v_regular_count;
  END IF;

  RETURN v_test_count + v_regular_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() TO service_role;

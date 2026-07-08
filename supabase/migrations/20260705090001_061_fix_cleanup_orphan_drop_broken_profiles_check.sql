-- 061_fix_cleanup_orphan_drop_broken_profiles_check.sql
-- Tier 1 fix 2: cleanup_orphan_anon_users is BROKEN by design.
--
-- The original function (migration 051/052) has:
--   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
-- But the on_auth_user_created trigger (migration 020:85-119) ALWAYS creates
-- a profiles row on signup. So the NOT EXISTS profiles check never matches,
-- and the function deletes zero rows.
--
-- Fix: drop the broken profiles check. The remaining predicates
-- (no server_game_state + no guest_identities + anon + 30 days old) are
-- sufficient to identify true orphans.
--
-- Also use COALESCE(p.last_active, u.created_at) so future "inactive X days"
-- semantics (tier 1 fix 4 wires last_active writes) are respected.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.cleanup_orphan_anon_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'cleanup_orphan_anon_users requires service_role';
  END IF;

  WITH orphans AS (
    SELECT u.id
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.is_anonymous = true
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
  WHERE id IN (SELECT id FROM orphans);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() TO service_role;

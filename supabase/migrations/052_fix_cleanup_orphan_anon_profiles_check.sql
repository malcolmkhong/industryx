-- BUG-034: cleanup_orphan_anon_users fails when the user has a profiles row
-- because profiles.id -> auth.users(id) FK has NO ACTION (not CASCADE).
-- The on_auth_user_created trigger creates a profiles row automatically on signup.
-- Fix: add profiles to the NOT EXISTS filter.

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
    WHERE u.is_anonymous = true
      AND u.created_at < now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.guest_identities gi WHERE gi.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = u.id
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

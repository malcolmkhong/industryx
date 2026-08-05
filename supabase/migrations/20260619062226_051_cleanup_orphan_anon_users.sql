-- Phase 3 migration 051: Periodic cleanup of orphan anonymous users.
-- A user is "orphan" if: is_anonymous=true AND older than 30 days AND has no
-- game state AND has no guest identity. These are users who signed in
-- anonymously, never played, and never linked Google. The auth.users rows
-- accumulate and cost nothing but clutter the admin "Players" page.
--
-- Pre-check confirmed: pg_cron extension is NOT enabled on this project.
-- The cron.schedule call is therefore NOT included. The function can be
-- invoked manually (SELECT public.cleanup_orphan_anon_users();) or by an
-- external scheduler (e.g. Supabase Edge Function cron, GitHub Actions).
--
-- The function is SECURITY DEFINER with an explicit service_role check so
-- even if the GRANT were ever loosened, the body would still reject non-
-- service callers.

-- Defensive: search_path is widened to include `auth` because the shadow
-- DB used by db diff --linked has the public schema but NOT auth. The
-- function body references auth.users, so without the wider search_path
-- the shadow replay fails with "conflicting or redundant options"
-- (Postgres rejects SET search_path = public when the function body
-- references unqualified relations). On the linked staging/prod
-- databases the wider search_path matches the intended scope.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    EXECUTE $SQL$
      CREATE OR REPLACE FUNCTION public.cleanup_orphan_anon_users()
      RETURNS integer
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth
      AS $BODY$
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
        )
        DELETE FROM auth.users
        WHERE id IN (SELECT id FROM orphans);

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $BODY$;

      REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM PUBLIC;
      REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM anon;
      REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM authenticated;
      GRANT EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() TO service_role;
    $SQL$;
  ELSE
    RAISE NOTICE '[051] auth schema not present in shadow DB — skipping cleanup_orphan_anon_users definition';
  END IF;
END
$$;

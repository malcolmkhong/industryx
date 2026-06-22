-- Migration 050: Create unlock_account RPC (admin tool)
-- Phase 1 — Foundation (Storage + Audit)
-- Pre-check: confirm function does not exist; verify a test user_id has a server_game_state row
-- Closes F-13 (no lock-resolution flow; resolved_by/resolved_at on cheat_investigations
-- but server_game_state.is_locked was never auto-cleared).

CREATE OR REPLACE FUNCTION public.unlock_account(
  p_user_id uuid,
  p_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'unlock_account requires service_role';
  END IF;
  UPDATE public.server_game_state
  SET is_locked = false,
      lock_reason = NULL,
      cheat_flag_count = 0
  WHERE user_id = p_user_id;
END;
$$;

-- Supabase has explicit grants to anon and authenticated that are NOT
-- removed by REVOKE FROM PUBLIC. Each must be revoked separately.
-- See BUG-031.
REVOKE EXECUTE ON FUNCTION public.unlock_account(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlock_account(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_account(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_account(uuid, text) TO service_role;

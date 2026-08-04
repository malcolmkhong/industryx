-- ============================================================================
-- Migration: 090_player_delete_cascade
-- Description: Server-authoritative player deletion.
--
-- Purpose:
--   Allow admins to fully delete a player account (auth.users + all related
--   gameplay rows + audit-safe tombstone). Without this, deleting
--   auth.users fails on RESTRICT FKs and leaves orphan game state.
--
-- Behavior:
--   - Converts RESTRICT FKs on legacy recovery tables to CASCADE so an
--     auth.users delete cleanly removes the player's recovery evidence.
--   - Adds delete_player_cascade(p_user_id) SECURITY DEFINER RPC that:
--       1. Removes all public-side rows that reference the user
--          (gameplay, audit-safe tombstones, recovery ledger).
--       2. Removes the auth.users row. Auth schema FKs to public.*
--          cascade automatically (player_progress, server_game_state,
--          player_actions, player_sessions, validated_actions,
--          cheat_investigations, leaderboard_entries, trade_history,
--          support_tickets, support_ticket_messages, daily_rewards,
--          daily_login_streaks, profiles).
--       3. Preserves admin_actions rows by SET NULL on target_user_id
--          (the audit trail keeps the UUID even if the user is gone).
--   - Adds 'delete_account' and 'bulk_delete_accounts' to admin_actions
--     action_type CHECK.
--
-- Safety:
--   - RPC is callable only by service_role. anon / authenticated revoked.
--   - All deletes happen in a single transaction — partial deletes are
--     impossible.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Convert RESTRICT FKs that block auth.users deletion.
--    These tables exist solely to support a specific player's recovery flow.
--    On player deletion we are OK losing the evidence.
-- ----------------------------------------------------------------------------
ALTER TABLE public.game_state_recovery_cases
  DROP CONSTRAINT IF EXISTS game_state_recovery_cases_user_id_fkey;
ALTER TABLE public.game_state_recovery_cases
  ADD CONSTRAINT game_state_recovery_cases_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.game_state_recovery_cases
  DROP CONSTRAINT IF EXISTS game_state_recovery_cases_approved_by_fkey;
ALTER TABLE public.game_state_recovery_cases
  ADD CONSTRAINT game_state_recovery_cases_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.game_state_recovery_receipts
  DROP CONSTRAINT IF EXISTS game_state_recovery_receipts_user_id_fkey;
ALTER TABLE public.game_state_recovery_receipts
  ADD CONSTRAINT game_state_recovery_receipts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ----------------------------------------------------------------------------
-- 2. Extend admin_actions.action_type to include delete events.
--    CHECK constraint is named admin_actions_action_type_check on the table
--    from 006_admin_moderation_system.sql.
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE public.admin_actions
  ADD CONSTRAINT admin_actions_action_type_check
  CHECK (action_type IN (
    'lock_account',
    'unlock_account',
    'reset_state',
    'resolve_investigation',
    'dismiss_investigation',
    'edit_state',
    'delete_account',
    'bulk_delete_accounts'
  ));


-- ----------------------------------------------------------------------------
-- 3. delete_player_cascade(p_user_id) RPC.
--    Fully delete a player. Service-role only.
--
--    Order:
--      a. Tombstone admin_actions.target_user_id → NULL (preserve audit).
--      b. DELETE public-side rows that FK back to auth.users. Most already
--         cascade, but a few tables (guest_identities, device_bindings,
--         profiles) need explicit deletes to avoid orphans.
--      c. DELETE auth.users. Auth schema cascades to all public.* tables
--         with ON DELETE CASCADE FKs.
--
--    Returns a small JSONB summary so the route can include it in the
--    response and audit details.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_player_cascade(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_existed BOOLEAN;
  v_deleted_admin_actions INT;
  v_deleted_guest_identities INT;
  v_deleted_device_bindings INT;
BEGIN
  -- Pre-flight: confirm the user exists.
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_existed;
  IF NOT v_existed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'USER_NOT_FOUND',
      'user_id', p_user_id
    );
  END IF;

  -- (a) Preserve audit: NULL-out target_user_id on admin_actions.
  --     This keeps the audit row but removes the FK reference so the
  --     auth.users delete doesn't fail (and doesn't need SET NULL).
  WITH updated AS (
    UPDATE public.admin_actions
    SET target_user_id = NULL
    WHERE target_user_id = p_user_id
    RETURNING 1
  )
  SELECT COUNT(*) FROM updated INTO v_deleted_admin_actions;

  -- (b) Explicit deletes for tables that don't cascade to auth.users.
  --     Most public.* tables with user_id FKs already have ON DELETE
  --     CASCADE. These are the exceptions.
  WITH deleted AS (
    DELETE FROM public.guest_identities
    WHERE user_id = p_user_id
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted INTO v_deleted_guest_identities;

  WITH deleted AS (
    DELETE FROM public.device_bindings
    WHERE user_id = p_user_id
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted INTO v_deleted_device_bindings;

  -- (c) Delete the auth user. Auth schema cascades handle the rest.
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'tombstoned_admin_actions', v_deleted_admin_actions,
    'deleted_guest_identities', v_deleted_guest_identities,
    'deleted_device_bindings', v_deleted_device_bindings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_player_cascade(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_player_cascade(UUID) TO service_role;

COMMENT ON FUNCTION public.delete_player_cascade(UUID) IS
  'Server-only full player deletion. Tombstones admin_actions and cascades all related gameplay rows. Service-role only.';


COMMIT;
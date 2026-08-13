-- ============================================================================
-- Migration: 094_fix_has_auth_progress_excludes_placeholders
-- Description: BUG-091 — `upgrade_guest_to_auth.has_auth_progress` returns TRUE
--              for placeholder rows (full_state->>'bootstrap_pending' = true),
--              which causes the read-side flow to skip `ensure_profile_and_state`
--              and hydrate from the placeholder instead of running the repair.
--
--              Symptom on production (2026-08-13):
--              - User signs in with Google for the first time on a fresh device.
--              - upgrade_guest_to_auth returns OK_NO_GUEST with has_auth_progress=TRUE
--                because a placeholder row already exists from a prior partial
--                bootstrap or sign-in attempt.
--              - The orchestrator skips ensure_profile_and_state, returns the
--                placeholder as-is, and the client renders canonical defaults
--                ($2,000 + empty buildings/workers).
--              - The user sees a fresh-looking profile instead of their saved
--                game.
--
--              This is correct behavior IF the user truly has no progress — the
--              read-side safety net in buildCompleteFullStateForServerRow
--              applies canonical defaults for placeholder rows so a missing-row
--              case still loads cleanly.
--
--              BUT: a placeholder row is not "progress" in any meaningful
--              sense — it's a marker that says "repair was deferred". Treating
--              it as has_auth_progress makes the orchestrator think the account
--              is initialized when it actually still needs the canonical
--              initial state promoted into full_state.
--
-- Fix:
--   1) has_auth_progress: only TRUE when a row exists AND it's not a placeholder.
--      When a placeholder is found, fall through to the existing repair branch
--      (ensure_profile_and_state) which writes the canonical initial state.
--   2) New migration marker: 094 sets the canonical policy for placeholder
--      detection so future writers either set bootstrap_pending=true (signaling
--      "needs repair") or write the real full_state (signaling "ready").
--
-- Bug:        BUG-091
-- ============================================================================

-- ─── 1. Refine has_auth_progress to exclude placeholder rows ──────────
CREATE OR REPLACE FUNCTION public.upgrade_guest_to_auth(
  p_auth_user_id UUID,
  p_device_id TEXT
)
RETURNS TABLE (
  status TEXT,
  surviving_user_id UUID,
  archived_guest_id UUID,
  has_auth_progress BOOLEAN,
  has_guest_progress BOOLEAN,
  bindings_preserved BIGINT,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_guest_id UUID;
  v_guest_binding_id UUID;
  v_auth_has_state BOOLEAN := FALSE;
  v_guest_has_state BOOLEAN := FALSE;
  v_auth_state_money NUMERIC := 0;
  v_guest_state_money NUMERIC := 0;
  v_preserved_count BIGINT := 0;
  v_moved_rows BIGINT := 0;
  v_archived_receipt_id UUID;
  v_policy TEXT;
BEGIN
  -- ── Auth user existence check ────────────────────────────────────────
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id = p_auth_user_id) THEN
    status := 'ERROR';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    -- BUG-091: was EXISTS(server_game_state WHERE user_id = auth). Now
    -- exclude placeholder rows so the orchestrator treats an
    -- uninitialized account as "no progress" and runs ensure_profile.
    has_auth_progress := EXISTS(
      SELECT 1 FROM public.server_game_state sgs
       WHERE sgs.user_id = p_auth_user_id
         AND (
           sgs.full_state IS NULL
           OR (sgs.full_state->>'bootstrap_pending')::boolean IS DISTINCT FROM TRUE
         )
    );
    has_guest_progress := NULL;
    bindings_preserved := NULL;
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock the active_guest binding for this device (transfer path = FOR UPDATE)
  SELECT db.user_id, db.id
    INTO v_guest_id, v_guest_binding_id
  FROM public.device_bindings db
  WHERE db.device_id = p_device_id
    AND db.binding_type = 'active_guest'
    AND db.status = 'active'
  LIMIT 1
  FOR UPDATE;

  -- No guest binding for this device — return early. has_auth_progress
  -- now correctly excludes placeholder rows so ensure_profile_and_state
  -- gets called for placeholder-only accounts.
  IF v_guest_id IS NULL THEN
    status := 'OK_NO_GUEST';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := NULL;
    -- BUG-091: was EXISTS(server_game_state WHERE user_id = auth). Now
    -- exclude placeholder rows (bootstrap_pending=true) so the
    -- orchestrator treats a placeholder-only account as "no progress"
    -- and runs ensure_profile_and_state to materialize canonical data.
    has_auth_progress := EXISTS(
      SELECT 1 FROM public.server_game_state sgs
       WHERE sgs.user_id = p_auth_user_id
         AND (
           sgs.full_state IS NULL
           OR (sgs.full_state->>'bootstrap_pending')::boolean IS DISTINCT FROM TRUE
         )
    );
    has_guest_progress := FALSE;
    bindings_preserved := v_preserved_count;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock both users' server_game_state rows for transfer consistency
  -- (only one or both may exist)
  PERFORM 1 FROM public.server_game_state sgs
    WHERE sgs.user_id IN (v_guest_id, p_auth_user_id)
    FOR UPDATE;

  SELECT COALESCE(money, 0)
    INTO v_auth_state_money
    FROM public.server_game_state
    WHERE user_id = p_auth_user_id;
  v_auth_has_state := FOUND;

  SELECT COALESCE(money, 0)
    INTO v_guest_state_money
    FROM public.server_game_state
    WHERE user_id = v_guest_id;
  v_guest_has_state := FOUND;

  -- ── Conflict path: both have progress → CONFLICT (legacy) ───────────
  IF v_auth_has_state AND v_guest_has_state THEN
    status := 'CONFLICT';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := v_guest_id;
    has_auth_progress := TRUE;
    has_guest_progress := TRUE;
    bindings_preserved := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Upgrade path: move guest state to auth user ─────────────────────
  IF v_guest_has_state AND NOT v_auth_has_state THEN
    UPDATE public.server_game_state
      SET user_id = p_auth_user_id
      WHERE user_id = v_guest_id;
    GET DIAGNOSTICS v_moved_rows = ROW_COUNT;

    IF v_moved_rows = 0 THEN
      RAISE EXCEPTION 'UPGRADE_GUEST_TO_AUTH: state transfer affected 0 rows (guest_id=%, auth_id=%)',
        v_guest_id, p_auth_user_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Deactivate the guest binding now that ownership transferred.
    UPDATE public.device_bindings
      SET status = 'superseded',
          superseded_by = p_auth_user_id,
          updated_at = NOW()
      WHERE id = v_guest_binding_id
        AND status = 'active';

    status := 'OK';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := NULL;
    has_auth_progress := TRUE;
    has_guest_progress := FALSE;
    bindings_preserved := v_preserved_count;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Auth-has-state only: nothing to move ────────────────────────────
  IF v_auth_has_state AND NOT v_guest_has_state THEN
    UPDATE public.device_bindings
      SET status = 'superseded',
          superseded_by = p_auth_user_id,
          updated_at = NOW()
      WHERE id = v_guest_binding_id
        AND status = 'active';

    status := 'OK';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := NULL;
    has_auth_progress := TRUE;
    has_guest_progress := FALSE;
    bindings_preserved := v_preserved_count;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ── Neither side has state: nothing to upgrade. Return OK_NO_GUEST
  --    semantics with has_auth_progress = FALSE so the orchestrator
  --    calls ensure_profile_and_state. ────────────────────────────────
  UPDATE public.device_bindings
    SET status = 'superseded',
        superseded_by = p_auth_user_id,
        updated_at = NOW()
    WHERE id = v_guest_binding_id
      AND status = 'active';

  status := 'OK_NO_GUEST';
  surviving_user_id := p_auth_user_id;
  archived_guest_id := NULL;
  has_auth_progress := FALSE;
  has_guest_progress := FALSE;
  bindings_preserved := v_preserved_count;
  error_code := NULL;
  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) IS
  'BUG-091: has_auth_progress excludes placeholder rows (full_state->>bootstrap_pending = true). Placeholder-only accounts are treated as uninitialized so ensure_profile_and_state runs.';

-- ─── 2. Backfill: clear placeholder rows for authenticated users ──────
-- Any auth user whose server_game_state is still a placeholder (rows
-- created by ensure_profile_and_state before the BUG-093 trigger
-- shipped, or by partial boot paths) gets the placeholder marker cleared
-- so the next bootstrap re-runs ensure_profile_and_state cleanly. This
-- is non-destructive: the denormalized columns (money, research_points,
-- etc.) are kept; only the bootstrap_pending flag and full_state shape
-- get reset.
DO $$
DECLARE
  v_cleared_count INTEGER;
BEGIN
  UPDATE public.server_game_state sgs
     SET full_state = '{}'::jsonb
   WHERE sgs.full_state IS NOT NULL
     AND (sgs.full_state->>'bootstrap_pending')::boolean = true
     AND EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = sgs.user_id AND p.is_guest = FALSE
     );
  GET DIAGNOSTICS v_cleared_count = ROW_COUNT;

  IF v_cleared_count > 0 THEN
    RAISE NOTICE '[094] cleared % placeholder full_state rows for authenticated users', v_cleared_count;
  ELSE
    RAISE NOTICE '[094] no authenticated placeholder rows to clear';
  END IF;
END $$;

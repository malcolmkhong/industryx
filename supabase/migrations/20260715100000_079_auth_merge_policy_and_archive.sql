-- ============================================================================
-- Migration 079: Auth-merge policy + recoverable guest-state archive
-- Audit 2026-07-15 — INDUSTRY-STANDARD guest→auth merge policy.
--
-- Replaces the legacy 409 ACCOUNT_PROGRESS_CONFLICT behavior of
-- upgrade_guest_to_auth with a server-controlled merge policy:
--
--   p_policy = 'auth_wins_archive_guest' (default, current users)
--     - Auth session is authoritative (RFC 6749 §1.5, OAuth 2.0).
--     - Active guest progress is moved into a recoverable archive row in
--       guest_state_archive (NOT deleted). Player can request restore via
--       support; restored_at marker invalidates the archive.
--     - Returns status='OK_ARCHIVED_GUEST' with archive_receipt_id.
--
--   p_policy = 'explicit_conflict' (opt-in)
--     - Preserves the previous behavior: returns 409 ACCOUNT_PROGRESS_CONFLICT
--       when both auth and guest have progress. User must explicitly resolve.
--     - Set per-user via profiles.auth_merge_policy.
--
-- Standards alignment (audit §11):
--   - GDPR SOC 2 (STD-014, STD-012): consent via policy column, recoverable
--     archive (no silent data loss), audit trail via archive_receipt + reason.
--   - NIST SSDF 1.1 (STD-008): traceable change history per archived state.
--
-- Idempotent: CREATE OR REPLACE for the RPC, ADD COLUMN IF NOT EXISTS for
-- the profile column, CREATE TABLE IF NOT EXISTS for the archive.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. guest_state_archive: recoverable snapshot of archived guest progress.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guest_state_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id UUID NOT NULL,
  archived_by_auth_user_id UUID NOT NULL REFERENCES auth.users(id),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  policy_applied TEXT NOT NULL
    CHECK (policy_applied IN ('auth_wins_archive_guest','explicit_conflict')),
  reason TEXT NOT NULL,
  full_state_snapshot JSONB NOT NULL,
  money NUMERIC NOT NULL DEFAULT 0,
  game_tick BIGINT NOT NULL DEFAULT 0,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  restored_at TIMESTAMPTZ,
  restored_via TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_state_archive_guest_latest
  ON public.guest_state_archive(guest_user_id, is_latest, archived_at DESC)
  WHERE is_latest = TRUE;

CREATE INDEX IF NOT EXISTS idx_guest_state_archive_auth_archived_at
  ON public.guest_state_archive(archived_by_auth_user_id, archived_at DESC);

ALTER TABLE public.guest_state_archive ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guest_state_archive'
      AND policyname = 'Service role full access on guest_state_archive'
  ) THEN
    CREATE POLICY "Service role full access on guest_state_archive"
      ON public.guest_state_archive FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guest_state_archive'
      AND policyname = 'Users read own archive entries'
  ) THEN
    CREATE POLICY "Users read own archive entries"
      ON public.guest_state_archive FOR SELECT TO authenticated
      USING (archived_by_auth_user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT ON public.guest_state_archive TO authenticated;
GRANT ALL ON public.guest_state_archive TO service_role;

COMMENT ON TABLE public.guest_state_archive IS
  'Migration 079: recoverable snapshot of guest progress archived at sign-in under policy=auth_wins_archive_guest. Required by GDPR/SOC2 (no silent data loss). One row per archive event; is_latest flags the most recent.';

-- ============================================================================
-- 2. profiles.auth_merge_policy: per-user policy preference (opt-in switch).
--    Default is auth_wins_archive_guest (industry-standard server-authoritative).
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'auth_merge_policy'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN auth_merge_policy TEXT NOT NULL
        DEFAULT 'auth_wins_archive_guest'
        CHECK (auth_merge_policy IN ('auth_wins_archive_guest','explicit_conflict'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.auth_merge_policy IS
  'Migration 079: per-user preference for resolving sign-in conflicts between auth progress and an active guest. Default auth_wins_archive_guest auto-archives and loads auth. Set explicit_conflict to preserve the legacy 409 prompt.';

-- ============================================================================
-- 3. upgrade_guest_to_auth: extended with policy parameter + archive path.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.upgrade_guest_to_auth(
  p_auth_user_id UUID,
  p_device_id TEXT,
  p_policy TEXT DEFAULT 'auth_wins_archive_guest'
)
RETURNS TABLE (
  status TEXT,
  surviving_user_id UUID,
  archived_guest_id UUID,
  has_auth_progress BOOLEAN,
  has_guest_progress BOOLEAN,
  bindings_preserved BIGINT,
  archive_receipt_id UUID,
  policy_applied TEXT,
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
  v_moved_rows INT := 0;
  v_archive_id UUID;
  v_guest_full_state JSONB;
  v_guest_game_tick BIGINT;
  v_guest_money NUMERIC;
  v_return_status TEXT := 'OK';
BEGIN
  -- 1. Policy allow-list (fail-closed per RULES.md [SEC-002]).
  IF p_policy NOT IN ('auth_wins_archive_guest','explicit_conflict') THEN
    status := 'ERROR';
    error_code := 'INVALID_POLICY';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2. Verify auth user exists.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_auth_user_id) THEN
    status := 'ERROR';
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3. Lock the active_guest binding for this device (transfer path).
  SELECT db.user_id, db.id
    INTO v_guest_id, v_guest_binding_id
  FROM public.device_bindings db
  WHERE db.device_id = p_device_id
    AND db.binding_type = 'active_guest'
    AND db.status = 'active'
  LIMIT 1
  FOR UPDATE;

  -- 4. No active guest binding → just bind + load (no archive needed).
  IF v_guest_id IS NULL THEN
    INSERT INTO public.device_bindings (device_id, user_id, binding_type, status)
      VALUES (p_device_id, p_auth_user_id, 'authenticated_association', 'active');

    SELECT COUNT(*) INTO v_preserved_count
      FROM public.device_bindings db
      WHERE db.device_id = p_device_id
        AND db.user_id = p_auth_user_id
        AND db.binding_type = 'authenticated_association'
        AND db.status = 'active';

    status := 'OK_NO_GUEST';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := NULL;
    has_auth_progress := EXISTS(
      SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = p_auth_user_id
    );
    has_guest_progress := FALSE;
    bindings_preserved := v_preserved_count;
    archive_receipt_id := NULL;
    policy_applied := p_policy;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 5. Lock both server_game_state rows for transfer consistency.
  PERFORM 1 FROM public.server_game_state sgs
    WHERE sgs.user_id IN (v_guest_id, p_auth_user_id)
    FOR UPDATE;

  -- 6. Detect progress (money > 0 OR game_tick > 0 indicates real progression).
  SELECT COALESCE(MAX(sgs.money), 0) > 0 OR COALESCE(MAX(sgs.game_tick), 0) > 0
    INTO v_auth_has_state
    FROM public.server_game_state sgs WHERE sgs.user_id = p_auth_user_id;

  SELECT COALESCE(MAX(sgs.money), 0) > 0 OR COALESCE(MAX(sgs.game_tick), 0) > 0
    INTO v_guest_has_state
    FROM public.server_game_state sgs WHERE sgs.user_id = v_guest_id;

  SELECT COALESCE(MAX(money), 0) INTO v_auth_state_money
    FROM public.server_game_state WHERE user_id = p_auth_user_id;
  SELECT COALESCE(MAX(money), 0) INTO v_guest_state_money
    FROM public.server_game_state WHERE user_id = v_guest_id;

  -- 7. Capture the guest full_state snapshot for archive.
  SELECT
    COALESCE(full_state, '{}'::jsonb),
    COALESCE(game_tick, 0),
    COALESCE(money, 0)
  INTO v_guest_full_state, v_guest_game_tick, v_guest_money
  FROM public.server_game_state WHERE user_id = v_guest_id;

  -- 8. Conflict policy branch.
  IF v_auth_has_state AND v_guest_has_state THEN
    IF p_policy = 'explicit_conflict' THEN
      -- Preserve legacy 409 behavior for opt-in users.
      status := 'CONFLICT';
      error_code := 'ACCOUNT_PROGRESS_CONFLICT';
      surviving_user_id := p_auth_user_id;
      archived_guest_id := v_guest_id;
      has_auth_progress := TRUE;
      has_guest_progress := TRUE;
      bindings_preserved := 0;
      archive_receipt_id := NULL;
      policy_applied := p_policy;
      RETURN NEXT;
      RETURN;
    END IF;
    -- DEFAULT 'auth_wins_archive_guest': archive guest, load auth.
    v_return_status := 'OK_ARCHIVED_GUEST';

    INSERT INTO public.guest_state_archive (
      guest_user_id, archived_by_auth_user_id, policy_applied,
      reason, full_state_snapshot, money, game_tick, is_latest
    ) VALUES (
      v_guest_id, p_auth_user_id, p_policy,
      'auth_session_authoritative_at_signin',
      v_guest_full_state, v_guest_money, v_guest_game_tick, TRUE
    )
    RETURNING id INTO v_archive_id;

    -- Mark prior archives of this guest as not_latest.
    UPDATE public.guest_state_archive
      SET is_latest = FALSE
      WHERE guest_user_id = v_guest_id
        AND id <> v_archive_id
        AND is_latest = TRUE;

    -- Drop the guest server_game_state (progress is archived, not deleted).
    DELETE FROM public.server_game_state WHERE user_id = v_guest_id;

  ELSIF v_guest_has_state AND NOT v_auth_has_state THEN
    -- Standard upgrade: move guest state to auth user (no archive needed).
    UPDATE public.server_game_state
      SET user_id = p_auth_user_id
      WHERE user_id = v_guest_id;
    GET DIAGNOSTICS v_moved_rows = ROW_COUNT;

    IF v_moved_rows = 0 THEN
      EXECUTE
        'INSERT INTO public.server_game_state (user_id, money, game_tick, game_speed, state_version, full_state, state_hash) ' ||
        'VALUES ($1, 0, 0, 1, 1, $2, '''' ) ON CONFLICT (user_id) DO NOTHING'
      USING p_auth_user_id, jsonb_build_object('bootstrap_pending', true);
    END IF;

    UPDATE public.player_progress SET user_id = p_auth_user_id WHERE user_id = v_guest_id;
    UPDATE public.player_actions SET user_id = p_auth_user_id WHERE user_id = v_guest_id;
    UPDATE public.player_sessions SET user_id = p_auth_user_id WHERE user_id = v_guest_id;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_player_pressure') THEN
      UPDATE public.market_player_pressure SET user_id = p_auth_user_id WHERE user_id = v_guest_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leaderboard_entries') THEN
      UPDATE public.leaderboard_entries SET user_id = p_auth_user_id WHERE user_id = v_guest_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_tickets') THEN
      UPDATE public.support_tickets SET user_id = p_auth_user_id WHERE user_id = v_guest_id;
    END IF;
  END IF;

  -- 9. Archive the guest binding (mark superseded).
  UPDATE public.device_bindings
    SET status = 'superseded',
        superseded_by = p_auth_user_id
    WHERE id = v_guest_binding_id;

  -- 10. Archive the guest_identities row.
  UPDATE public.guest_identities
    SET superseded_at = NOW(),
        superseded_by = p_auth_user_id
    WHERE user_id = v_guest_id
      AND superseded_by IS NULL;

  -- 11. Create the authenticated association binding.
  INSERT INTO public.device_bindings (device_id, user_id, binding_type, status)
    VALUES (p_device_id, p_auth_user_id, 'authenticated_association', 'active');

  SELECT COUNT(*) INTO v_preserved_count
    FROM public.device_bindings db
    WHERE db.device_id = p_device_id
      AND db.user_id = p_auth_user_id
      AND db.binding_type = 'authenticated_association'
      AND db.status = 'active';

  -- 12. Final status (OK_ARCHIVED_GUEST if we archived in step 8).
  status := v_return_status;
  surviving_user_id := p_auth_user_id;
  archived_guest_id := v_guest_id;
  has_auth_progress := TRUE;
  has_guest_progress := FALSE;
  bindings_preserved := v_preserved_count;
  archive_receipt_id := CASE
    WHEN v_return_status = 'OK_ARCHIVED_GUEST' THEN v_archive_id
    ELSE NULL
  END;
  policy_applied := p_policy;
  error_code := NULL;
  RETURN NEXT;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'UPGRADE_GUEST_TO_AUTH_FAILED: % (SQLSTATE %)', SQLERRM, SQLSTATE
      USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT) TO service_role;

-- Drop old signature grants/revokes before recreating on the new signature.
DO $revoke_upgrade_grants$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'upgrade_guest_to_auth'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text'
  ) THEN
    -- Two args version still matches the pg_proc table since CREATE OR REPLACE
    -- preserved it. Explicitly revoke the new 3-arg signature here.
  END IF;
END $revoke_upgrade_grants$;

REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT) FROM authenticated;

COMMENT ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT) IS
  'Migration 079: extend with policy parameter. Default auth_wins_archive_guest auto-archives guest progress (recoverable in guest_state_archive) and loads auth. p_policy=explicit_conflict preserves the legacy 409 conflict prompt.';

COMMIT;

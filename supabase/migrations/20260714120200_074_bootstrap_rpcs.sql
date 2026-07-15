-- Migration 074: Atomic bootstrap RPCs per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §16
--
-- Five RPC functions as the canonical atomic transaction boundary for every
-- multi-step auth/identity/binding/state write:
--
--   1. bootstrap_guest(p_device_id, p_fingerprint_hash)
--   2. bootstrap_authenticated(p_auth_user_id, p_device_id)
--   3. create_signed_out_guest_after_signout(p_auth_user_id, p_device_id)
--   4. upgrade_guest_to_auth(p_auth_user_id, p_device_id)
--   5. ensure_profile_and_state(p_user_id)
--
-- Design per plan §8 (concurrency strategy):
--   - Partial unique index unique_active_guest_binding_per_device is authority
--     for preventing duplicate active_guest bindings.
--   - INSERT ... ON CONFLICT DO NOTHING for binding creation; re-read on miss.
--   - SELECT ... FOR UPDATE reserved for transfer/archival paths only.
--
-- Design per plan §16:
--   - All functions SECURITY DEFINER, service-role only.
--   - Real atomic transaction with full rollback on failure.
--   - Idempotent under repeated or concurrent requests.
--   - Map outcomes to API error codes from §15.
--
-- Idempotent: uses CREATE OR REPLACE for functions.

BEGIN;

-- Tighten default grants: revoke public execute, keep service_role only.
-- REVOKE has no IF EXISTS, so we guard with EXISTS checks in a DO block.
-- This runs at the END of the function declarations (below), because
-- PostgreSQL requires the function to exist before REVOKE.

-- ============================================================================
-- 1. bootstrap_guest(p_device_id, p_fingerprint_hash)
--    Idempotent guest bootstrap via device_id.
--    Per plan §8: ON CONFLICT DO NOTHING + re-read for race-safe creation.
--    Per plan §10: p_fingerprint_hash is never used for identity lookup;
--                  stored only as metadata if provided.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_guest(
  p_device_id TEXT,
  p_fingerprint_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
  status TEXT,
  user_id UUID,
  binding_id UUID,
  is_new_user BOOLEAN,
  has_game_state BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_binding_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_has_state BOOLEAN := FALSE;
  v_anon_email TEXT;
BEGIN
  -- Phase A: idempotent lookup of existing active guest binding
  SELECT db.user_id, db.id
    INTO v_user_id, v_binding_id
  FROM public.device_bindings db
  WHERE db.device_id = p_device_id
    AND db.binding_type = 'active_guest'
    AND db.status = 'active'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = v_user_id
    ) INTO v_has_state;
    status := 'OK';
    user_id := v_user_id;
    binding_id := v_binding_id;
    is_new_user := FALSE;
    has_game_state := v_has_state;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Phase B: create new anon auth.users + device_bindings + server_game_state
  -- handle_new_user() trigger (migration 020/055/056) creates the profile row.
  v_anon_email := 'guest-' || replace(gen_random_uuid()::text, '-', '') || '@guest.industryx.game';

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_anon_email,
    '',
    NOW(),
    jsonb_build_object(
      'provider', 'anonymous',
      'providers', ARRAY['anonymous']::TEXT[]
    ),
    jsonb_build_object(
      'device_id', p_device_id,
      'is_anonymous', true,
      'fingerprint', COALESCE(p_fingerprint_hash, '')
    ),
    NOW(),
    NOW(),
    true
  )
  RETURNING id INTO v_user_id;

  v_is_new := TRUE;

  -- Race-safe binding creation per plan §8: ON CONFLICT DO NOTHING.
  -- Bare column names: works for ON CONFLICT DO NOTHING (no conflict target).
  INSERT INTO public.device_bindings (
    device_id, user_id, binding_type, status
  ) VALUES (
    p_device_id, v_user_id, 'active_guest', 'active'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_binding_id;

  -- Conflict: a parallel bootstrap won. Re-read the winning row.
  IF v_binding_id IS NULL THEN
    SELECT db.user_id, db.id
      INTO v_user_id, v_binding_id
    FROM public.device_bindings db
    WHERE db.device_id = p_device_id
      AND db.binding_type = 'active_guest'
      AND db.status = 'active'
    LIMIT 1;
    v_is_new := FALSE;
  END IF;

  -- Minimal server_game_state row. PR 3 service hydrates with canonical config.
  -- EXECUTE: bare column refs ambiguous under RETURNS TABLE OUT param shadow
  -- once ON CONFLICT (user_id) appears; dynamic SQL bypasses PL/pgSQL scope.
  EXECUTE
    'INSERT INTO public.server_game_state (user_id, money, game_tick, game_speed, state_version, full_state, state_hash) ' ||
    'VALUES ($1, 0, 0, 1, 1, $2, '''' ) ON CONFLICT (user_id) DO NOTHING'
  USING v_user_id, jsonb_build_object('bootstrap_pending', true);

  SELECT EXISTS(
    SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = v_user_id
  ) INTO v_has_state;

  status := 'OK';
  user_id := v_user_id;
  binding_id := v_binding_id;
  is_new_user := v_is_new;
  has_game_state := v_has_state;
  error_code := NULL;
  RETURN NEXT;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    -- Full ROLLBACK on any failure (PL/pgSQL function runs in single tx).
    -- Map to INTERNAL_BOOTSTRAP_ERROR per plan §15.
    RAISE EXCEPTION 'BOOTSTRAP_GUEST_FAILED: % (SQLSTATE %)', SQLERRM, SQLSTATE
      USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_guest(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.bootstrap_guest(TEXT, TEXT) IS
  'Migration 074: atomic guest bootstrap. Per plan §8 ON CONFLICT DO NOTHING + re-read. Per plan §10 fingerprint is never used for identity lookup.';


-- ============================================================================
-- 2. bootstrap_authenticated(p_auth_user_id, p_device_id)
--    Idempotent device-binding for a verified authenticated user.
--    Does NOT create new game state — only ensures binding exists.
--    Returns profile+state status so caller can decide repair vs recovery.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_authenticated(
  p_auth_user_id UUID,
  p_device_id TEXT
)
RETURNS TABLE (
  status TEXT,
  binding_id UUID,
  is_new_binding BOOLEAN,
  has_profile BOOLEAN,
  has_game_state BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_binding_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_has_profile BOOLEAN := FALSE;
  v_has_state BOOLEAN := FALSE;
  v_user_exists BOOLEAN := FALSE;
BEGIN
  -- Validate auth user exists
  SELECT EXISTS(
    SELECT 1 FROM auth.users u WHERE u.id = p_auth_user_id
  ) INTO v_user_exists;
  IF NOT v_user_exists THEN
    status := 'ERROR';
    error_code := 'STATE_RECOVERY_REQUIRED';
    binding_id := NULL;
    is_new_binding := NULL;
    has_profile := NULL;
    has_game_state := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Check profile + state existence
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id = p_auth_user_id
  ) INTO v_has_profile;
  SELECT EXISTS(
    SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = p_auth_user_id
  ) INTO v_has_state;

  -- Phase A: existing authenticated_association binding?
  SELECT db.id INTO v_binding_id
  FROM public.device_bindings db
  WHERE db.device_id = p_device_id
    AND db.user_id = p_auth_user_id
    AND db.binding_type = 'authenticated_association'
    AND db.status = 'active'
  LIMIT 1;

  IF v_binding_id IS NOT NULL THEN
    status := 'OK';
    binding_id := v_binding_id;
    is_new_binding := FALSE;
    has_profile := v_has_profile;
    has_game_state := v_has_state;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Phase B: create binding (idempotent on (device_id, user_id, binding_type))
  -- We rely on the index/user_id to allow multiple authenticated_association
  -- rows on one device for the same user across sessions. No unique constraint
  -- on this pair, so just check first.
  INSERT INTO public.device_bindings (
    device_id, user_id, binding_type, status
  ) VALUES (
    p_device_id, p_auth_user_id, 'authenticated_association', 'active'
  )
  RETURNING id INTO v_binding_id;

  v_is_new := TRUE;

  status := 'OK';
  binding_id := v_binding_id;
  is_new_binding := v_is_new;
  has_profile := v_has_profile;
  has_game_state := v_has_state;
  error_code := NULL;
  RETURN NEXT;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'BOOTSTRAP_AUTHENTICATED_FAILED: % (SQLSTATE %)', SQLERRM, SQLSTATE
      USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_authenticated(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.bootstrap_authenticated(UUID, TEXT) IS
  'Migration 074: idempotent authenticated device binding. Never creates game state.';


-- ============================================================================
-- 3. create_signed_out_guest_after_signout(p_auth_user_id, p_device_id)
--    Per plan §6 sign-out flow step 4: create new guest + initial state
--    transactionally while preserving the authenticated_association row.
--    p_auth_user_id may be NULL for users who never authenticated.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_signed_out_guest_after_signout(
  p_auth_user_id UUID,
  p_device_id TEXT
)
RETURNS TABLE (
  status TEXT,
  guest_user_id UUID,
  binding_id UUID,
  is_new_guest BOOLEAN,
  has_game_state BOOLEAN,
  preserved_association_count BIGINT,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_guest_id UUID;
  v_binding_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_has_state BOOLEAN := FALSE;
  v_preserved_count BIGINT := 0;
  v_anon_email TEXT;
BEGIN
  -- Phase A: count preserved authenticated associations for this device
  IF p_auth_user_id IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_preserved_count
    FROM public.device_bindings db
    WHERE db.device_id = p_device_id
      AND db.user_id = p_auth_user_id
      AND db.binding_type = 'authenticated_association'
      AND db.status = 'active';
  END IF;

  -- Phase B: existing active_guest binding for device?
  SELECT db.user_id, db.id
    INTO v_guest_id, v_binding_id
  FROM public.device_bindings db
  WHERE db.device_id = p_device_id
    AND db.binding_type = 'active_guest'
    AND db.status = 'active'
  LIMIT 1;

  IF v_guest_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = v_guest_id
    ) INTO v_has_state;
    status := 'OK';
    guest_user_id := v_guest_id;
    binding_id := v_binding_id;
    is_new_guest := FALSE;
    has_game_state := v_has_state;
    preserved_association_count := v_preserved_count;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Phase C: create new anon user + binding + state
  v_anon_email := 'guest-' || replace(gen_random_uuid()::text, '-', '') || '@guest.industryx.game';

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_anon_email,
    '',
    NOW(),
    jsonb_build_object(
      'provider', 'anonymous',
      'providers', ARRAY['anonymous']::TEXT[]
    ),
    jsonb_build_object(
      'device_id', p_device_id,
      'is_anonymous', true,
      'signed_out_from_auth', COALESCE(p_auth_user_id::TEXT, '')
    ),
    NOW(),
    NOW(),
    true
  )
  RETURNING id INTO v_guest_id;

  v_is_new := TRUE;

  INSERT INTO public.device_bindings (
    device_id, user_id, binding_type, status
  ) VALUES (
    p_device_id, v_guest_id, 'active_guest', 'active'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_binding_id;

  IF v_binding_id IS NULL THEN
    SELECT db.user_id, db.id
      INTO v_guest_id, v_binding_id
    FROM public.device_bindings db
    WHERE db.device_id = p_device_id
      AND db.binding_type = 'active_guest'
      AND db.status = 'active'
    LIMIT 1;
    v_is_new := FALSE;
  END IF;

  -- EXECUTE: see bootstrap_guest for rationale
  EXECUTE
    'INSERT INTO public.server_game_state (user_id, money, game_tick, game_speed, state_version, full_state, state_hash) ' ||
    'VALUES ($1, 0, 0, 1, 1, $2, '''' ) ON CONFLICT (user_id) DO NOTHING'
  USING v_guest_id, jsonb_build_object('bootstrap_pending', true);

  SELECT EXISTS(
    SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = v_guest_id
  ) INTO v_has_state;

  status := 'OK';
  guest_user_id := v_guest_id;
  binding_id := v_binding_id;
  is_new_guest := v_is_new;
  has_game_state := v_has_state;
  preserved_association_count := v_preserved_count;
  error_code := NULL;
  RETURN NEXT;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'CREATE_SIGNED_OUT_GUEST_FAILED: % (SQLSTATE %)', SQLERRM, SQLSTATE
      USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT) IS
  'Migration 074: per plan §6 sign-out step 4. Creates new guest transactionally, preserves authenticated_association rows.';


-- ============================================================================
-- 4. upgrade_guest_to_auth(p_auth_user_id, p_device_id)
--    Per plan §11: atomic guest-to-auth upgrade.
--    SELECT ... FOR UPDATE used here (transfer path) per plan §8.
--    Returns CONFLICT status if both auth and guest have progress.
-- ============================================================================
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
  v_moved_rows INT := 0;
BEGIN
  -- Verify auth user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_auth_user_id) THEN
    status := 'ERROR';
    error_code := 'STATE_RECOVERY_REQUIRED';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    has_auth_progress := NULL;
    has_guest_progress := NULL;
    bindings_preserved := NULL;
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

  -- No active guest binding → nothing to upgrade
  IF v_guest_id IS NULL THEN
    -- Still create authenticated_association for the device
    INSERT INTO public.device_bindings (
      device_id, user_id, binding_type, status
    ) VALUES (
      p_device_id, p_auth_user_id, 'authenticated_association', 'active'
    );
    SELECT COUNT(*)
      INTO v_preserved_count
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
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock both users' server_game_state rows for transfer consistency
  -- (only one or both may exist)
  PERFORM 1 FROM public.server_game_state sgs
    WHERE sgs.user_id IN (v_guest_id, p_auth_user_id)
    FOR UPDATE;

  -- Detect progress (money > 0 or game_tick > 0 indicates real progression)
  SELECT
    COALESCE(MAX(sgs.money), 0) > 0 OR COALESCE(MAX(sgs.game_tick), 0) > 0
  INTO v_auth_has_state
  FROM public.server_game_state sgs WHERE sgs.user_id = p_auth_user_id;

  SELECT
    COALESCE(MAX(sgs.money), 0) > 0 OR COALESCE(MAX(sgs.game_tick), 0) > 0
  INTO v_guest_has_state
  FROM public.server_game_state sgs WHERE sgs.user_id = v_guest_id;

  SELECT COALESCE(MAX(money), 0) INTO v_auth_state_money
    FROM public.server_game_state WHERE user_id = p_auth_user_id;
  SELECT COALESCE(MAX(money), 0) INTO v_guest_state_money
    FROM public.server_game_state WHERE user_id = v_guest_id;

  -- CONFLICT: both have progress → do not auto-merge (per plan §11)
  IF v_auth_has_state AND v_guest_has_state THEN
    status := 'CONFLICT';
    error_code := 'ACCOUNT_PROGRESS_CONFLICT';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := v_guest_id;
    has_auth_progress := TRUE;
    has_guest_progress := TRUE;
    bindings_preserved := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Upgrade path: move guest state to auth user
  IF v_guest_has_state AND NOT v_auth_has_state THEN
    -- Reassign server_game_state ownership
    UPDATE public.server_game_state
      SET user_id = p_auth_user_id
      WHERE user_id = v_guest_id;
    GET DIAGNOSTICS v_moved_rows = ROW_COUNT;

    IF v_moved_rows = 0 THEN
      -- Should not happen, but defensive. EXECUTE: see bootstrap_guest.
      EXECUTE
        'INSERT INTO public.server_game_state (user_id, money, game_tick, game_speed, state_version, full_state, state_hash) ' ||
        'VALUES ($1, 0, 0, 1, 1, $2, '''' ) ON CONFLICT (user_id) DO NOTHING'
      USING p_auth_user_id, jsonb_build_object('bootstrap_pending', true);
    END IF;

    -- Reassign per-user tables from guestIdentities.ts REASSIGNABLE_TABLES
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

  -- Archive guest binding (mark superseded by auth user)
  UPDATE public.device_bindings
    SET status = 'superseded',
        superseded_by = p_auth_user_id
    WHERE id = v_guest_binding_id;

  -- Archive guest_identities row
  UPDATE public.guest_identities
    SET superseded_at = NOW(),
        superseded_by = p_auth_user_id
    WHERE user_id = v_guest_id
      AND superseded_by IS NULL;

  -- Create authenticated_association binding
  INSERT INTO public.device_bindings (
    device_id, user_id, binding_type, status
  ) VALUES (
    p_device_id, p_auth_user_id, 'authenticated_association', 'active'
  );

  SELECT COUNT(*)
    INTO v_preserved_count
  FROM public.device_bindings db
  WHERE db.device_id = p_device_id
    AND db.user_id = p_auth_user_id
    AND db.binding_type = 'authenticated_association'
    AND db.status = 'active';

  status := 'OK';
  surviving_user_id := p_auth_user_id;
  archived_guest_id := v_guest_id;
  has_auth_progress := TRUE;
  has_guest_progress := FALSE;
  bindings_preserved := v_preserved_count;
  error_code := NULL;
  RETURN NEXT;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'UPGRADE_GUEST_TO_AUTH_FAILED: % (SQLSTATE %)', SQLERRM, SQLSTATE
      USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) IS
  'Migration 074: per plan §11 atomic guest-to-auth upgrade. Returns CONFLICT status if both have progress.';


-- ============================================================================
-- 5. ensure_profile_and_state(p_user_id)
--    Deterministic repair per plan §6 for incomplete authenticated records.
--    Returns NEEDS_RECOVERY if auth.users doesn't exist (caller → 422).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ensure_profile_and_state(
  p_user_id UUID
)
RETURNS TABLE (
  status TEXT,
  profile_created BOOLEAN,
  state_created BOOLEAN,
  needs_recovery BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_created BOOLEAN := FALSE;
  v_state_created BOOLEAN := FALSE;
  v_user_exists BOOLEAN := FALSE;
BEGIN
  -- Validate auth user exists
  SELECT EXISTS(
    SELECT 1 FROM auth.users u WHERE u.id = p_user_id
  ) INTO v_user_exists;
  IF NOT v_user_exists THEN
    status := 'ERROR';
    needs_recovery := TRUE;
    error_code := 'STATE_RECOVERY_REQUIRED';
    profile_created := NULL;
    state_created := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, is_guest, updated_at)
  VALUES (p_user_id, FALSE, NOW())
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_profile_created = ROW_COUNT;

  -- Ensure server_game_state exists. EXECUTE: see bootstrap_guest rationale.
  EXECUTE
    'INSERT INTO public.server_game_state (user_id, money, game_tick, game_speed, state_version, full_state, state_hash) ' ||
    'VALUES ($1, 0, 0, 1, 1, $2, '''' ) ON CONFLICT (user_id) DO NOTHING'
  USING p_user_id, jsonb_build_object('bootstrap_pending', true);
  GET DIAGNOSTICS v_state_created = ROW_COUNT;

  status := 'OK';
  profile_created := v_profile_created;
  state_created := v_state_created;
  needs_recovery := FALSE;
  error_code := NULL;
  RETURN NEXT;
  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'ENSURE_PROFILE_AND_STATE_FAILED: % (SQLSTATE %)', SQLERRM, SQLSTATE
      USING ERRCODE = 'P0001';
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile_and_state(UUID) TO service_role;

COMMENT ON FUNCTION public.ensure_profile_and_state(UUID) IS
  'Migration 074: deterministic repair for incomplete authenticated records. Returns NEEDS_RECOVERY if auth user missing (caller → 422).';

-- ============================================================================
-- ADD superseded_by to device_bindings.
-- Required by upgrade_guest_to_auth to archive a guest binding when promoting
-- to authenticated user. Foregoes separate migration since PR 1 (073) shipped
-- without it; this fixes the gap before RPC dependency on the column.
-- ============================================================================
ALTER TABLE public.device_bindings
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_device_bindings_superseded_by
  ON public.device_bindings(superseded_by)
  WHERE superseded_by IS NOT NULL;

COMMENT ON COLUMN public.device_bindings.superseded_by IS
  'Migration 074: auth user who superseded this binding (upgrade_guest_to_auth sets it on guest binding archive).';

-- ============================================================================
-- TIGHTEN GRANTS: revoke PUBLIC execute on the RPCs, grant only service_role.
-- Done after all function definitions so the functions exist.
-- REVOKE has no IF EXISTS, so wrap in DO block.
-- ============================================================================
DO $revoke_rpc_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'bootstrap_guest') THEN
    REVOKE EXECUTE ON FUNCTION public.bootstrap_guest(TEXT, TEXT) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.bootstrap_guest(TEXT, TEXT) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.bootstrap_guest(TEXT, TEXT) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'bootstrap_authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.bootstrap_authenticated(UUID, TEXT) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.bootstrap_authenticated(UUID, TEXT) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.bootstrap_authenticated(UUID, TEXT) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'create_signed_out_guest_after_signout') THEN
    REVOKE EXECUTE ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'upgrade_guest_to_auth') THEN
    REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'ensure_profile_and_state') THEN
    REVOKE EXECUTE ON FUNCTION public.ensure_profile_and_state(UUID) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.ensure_profile_and_state(UUID) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.ensure_profile_and_state(UUID) FROM authenticated;
  END IF;
END
$revoke_rpc_grants$;

COMMIT;

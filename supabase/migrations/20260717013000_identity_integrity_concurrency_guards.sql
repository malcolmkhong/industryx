-- Identity-integrity concurrency guards.
--
-- This migration hardens the canonical bootstrap RPCs only. It intentionally
-- does not update, classify, reserialize, or otherwise modify existing
-- server_game_state.full_state payloads. In particular, it removes the
-- auto-archive/delete branch from guest-to-auth upgrades: two existing state
-- rows are an explicit ACCOUNT_PROGRESS_CONFLICT, never an automatic merge.
--
-- The authenticated association unique index is deliberately NOT created in
-- this migration. The staging integrity inventory found duplicate active
-- (device_id, user_id) rows; PostgreSQL cannot create the partial unique index
-- until a separately approved, row-by-row supersession cleanup is complete.

BEGIN;

-- Supports the deterministic re-read used by every locked RPC. This is not a
-- uniqueness constraint and therefore is safe while duplicate historical rows
-- still exist.
CREATE INDEX IF NOT EXISTS idx_device_bindings_active_auth_pair_order
  ON public.device_bindings (device_id, user_id, created_at, id)
  WHERE binding_type = 'authenticated_association'
    AND status = 'active';

-- Transaction-scoped advisory lock. A hash collision merely serializes two
-- unrelated devices; it cannot grant one device access to another.
CREATE OR REPLACE FUNCTION public.lock_identity_device(p_device_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_device_id IS NULL
     OR length(btrim(p_device_id)) = 0
     OR length(p_device_id) > 512
  THEN
    RAISE EXCEPTION 'Invalid device id' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('industryx:identity-device:' || p_device_id, 0)
  );
END;
$$;

-- Both ownership-transfer principals are locked in UUID order. Profile rows
-- and state rows use the same order inside upgrade_guest_to_auth below.
CREATE OR REPLACE FUNCTION public.lock_identity_users(
  p_first_user_id UUID,
  p_second_user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_first_user_id
     OR auth_user.id = p_second_user_id
  ORDER BY auth_user.id
  FOR UPDATE;
END;
$$;

-- Canonical anonymous bootstrap. The advisory lock is acquired before any
-- auth/profile/binding/state write, so a losing concurrent request does not
-- create an orphan auth user or profile.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_binding_id UUID;
  v_lifecycle TEXT;
  v_has_state BOOLEAN := FALSE;
  v_is_guest BOOLEAN;
  v_profile_found BOOLEAN := FALSE;
  v_anon_email TEXT;
BEGIN
  PERFORM public.lock_identity_device(p_device_id);

  -- Re-read only after holding the device lock. The oldest valid row is the
  -- deterministic winner if legacy data is already duplicated.
  SELECT binding.user_id, binding.id
    INTO v_user_id, v_binding_id
  FROM public.device_bindings AS binding
  WHERE binding.device_id = p_device_id
    AND binding.binding_type = 'active_guest'
    AND binding.status = 'active'
  ORDER BY binding.created_at ASC, binding.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_user_id IS NOT NULL THEN
    SELECT profile.is_guest, profile.progress_lifecycle
      INTO v_is_guest, v_lifecycle
    FROM public.profiles AS profile
    WHERE profile.id = v_user_id
    FOR UPDATE;
    v_profile_found := FOUND;

    SELECT EXISTS (
      SELECT 1 FROM public.server_game_state AS state
      WHERE state.user_id = v_user_id
    ) INTO v_has_state;

    IF NOT v_profile_found OR v_is_guest IS DISTINCT FROM TRUE THEN
      status := CASE
        WHEN NOT v_profile_found THEN 'STATE_RECOVERY_REQUIRED'
        ELSE 'DEVICE_BOUND_TO_OTHER_USER'
      END;
      user_id := NULL;
      binding_id := v_binding_id;
      is_new_user := FALSE;
      has_game_state := v_has_state;
      error_code := status;
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_lifecycle IS DISTINCT FROM 'active' OR NOT v_has_state THEN
      status := 'STATE_RECOVERY_REQUIRED';
      user_id := v_user_id;
      binding_id := v_binding_id;
      is_new_user := FALSE;
      has_game_state := v_has_state;
      error_code := 'STATE_RECOVERY_REQUIRED';
      RETURN NEXT;
      RETURN;
    END IF;

    status := 'OK_EXISTING';
    user_id := v_user_id;
    binding_id := v_binding_id;
    is_new_user := FALSE;
    has_game_state := TRUE;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- The new auth row, trigger-created profile, guest binding, and placeholder
  -- state are one function transaction. Any exception rolls all of them back.
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
    jsonb_build_object('provider', 'anonymous', 'providers', ARRAY['anonymous']::TEXT[]),
    jsonb_build_object(
      'device_id', p_device_id,
      'is_anonymous', TRUE,
      'fingerprint', COALESCE(p_fingerprint_hash, '')
    ),
    NOW(),
    NOW(),
    TRUE
  )
  RETURNING id INTO v_user_id;

  -- Lock the profile created by the auth trigger before creating its first
  -- gameplay state. The Priority 3 lifecycle trigger owns activation.
  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id
  FOR UPDATE;

  INSERT INTO public.device_bindings (device_id, user_id, binding_type, status)
  VALUES (p_device_id, v_user_id, 'active_guest', 'active')
  RETURNING id INTO v_binding_id;

  INSERT INTO public.server_game_state (
    user_id, money, game_tick, game_speed, state_version, full_state, state_hash
  ) VALUES (
    v_user_id, 0, 0, 1, 1, jsonb_build_object('bootstrap_pending', TRUE), ''
  );

  status := 'OK_CREATED';
  user_id := v_user_id;
  binding_id := v_binding_id;
  is_new_user := TRUE;
  has_game_state := TRUE;
  error_code := NULL;
  RETURN NEXT;
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    status := 'RETRYABLE_FAILURE';
    user_id := NULL;
    binding_id := NULL;
    is_new_user := NULL;
    has_game_state := NULL;
    error_code := 'BOOTSTRAP_UNAVAILABLE';
    RETURN NEXT;
    RETURN;
END;
$$;

-- Canonical authenticated bootstrap. This RPC binds an already-verified auth
-- user to a device; it never creates a profile or replacement gameplay state.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_binding_id UUID;
  v_lifecycle TEXT;
  v_has_state BOOLEAN := FALSE;
BEGIN
  PERFORM public.lock_identity_device(p_device_id);
  PERFORM public.lock_identity_users(p_auth_user_id);

  SELECT profile.progress_lifecycle
    INTO v_lifecycle
  FROM public.profiles AS profile
  WHERE profile.id = p_auth_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    status := 'STATE_RECOVERY_REQUIRED';
    binding_id := NULL;
    is_new_binding := NULL;
    has_profile := FALSE;
    has_game_state := NULL;
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.server_game_state AS state
    WHERE state.user_id = p_auth_user_id
  ) INTO v_has_state;

  -- Lifecycle mismatches are never repaired by a device-binding request.
  IF (v_lifecycle = 'active' AND NOT v_has_state)
     OR v_lifecycle = 'recovery_required'
     OR v_lifecycle NOT IN ('never_initialized', 'active')
     OR (v_lifecycle = 'never_initialized' AND v_has_state)
  THEN
    status := 'STATE_RECOVERY_REQUIRED';
    binding_id := NULL;
    is_new_binding := NULL;
    has_profile := TRUE;
    has_game_state := v_has_state;
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Re-read the deterministic winner after acquiring the device lock. The
  -- future partial unique index will enforce this physically once old rows are
  -- superseded; the lock makes new writes idempotent today.
  SELECT binding.id
    INTO v_binding_id
  FROM public.device_bindings AS binding
  WHERE binding.device_id = p_device_id
    AND binding.user_id = p_auth_user_id
    AND binding.binding_type = 'authenticated_association'
    AND binding.status = 'active'
  ORDER BY binding.created_at ASC, binding.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_binding_id IS NOT NULL THEN
    status := 'OK_EXISTING';
    binding_id := v_binding_id;
    is_new_binding := FALSE;
    has_profile := TRUE;
    has_game_state := v_has_state;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.device_bindings (device_id, user_id, binding_type, status)
  VALUES (p_device_id, p_auth_user_id, 'authenticated_association', 'active')
  RETURNING id INTO v_binding_id;

  status := 'OK_CREATED';
  binding_id := v_binding_id;
  is_new_binding := TRUE;
  has_profile := TRUE;
  has_game_state := v_has_state;
  error_code := NULL;
  RETURN NEXT;
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    status := 'RETRYABLE_FAILURE';
    binding_id := NULL;
    is_new_binding := NULL;
    has_profile := NULL;
    has_game_state := NULL;
    error_code := 'BOOTSTRAP_UNAVAILABLE';
    RETURN NEXT;
    RETURN;
END;
$$;

-- Sign-out keeps authenticated associations intact and either returns the
-- existing active guest or creates one behind the same device lock as normal
-- guest bootstrap. No authenticated progress is moved or reset here.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guest_id UUID;
  v_binding_id UUID;
  v_lifecycle TEXT;
  v_is_guest BOOLEAN;
  v_profile_found BOOLEAN := FALSE;
  v_has_state BOOLEAN := FALSE;
  v_preserved_count BIGINT := 0;
  v_anon_email TEXT;
BEGIN
  PERFORM public.lock_identity_device(p_device_id);

  IF p_auth_user_id IS NOT NULL THEN
    PERFORM public.lock_identity_users(p_auth_user_id);
    SELECT COUNT(*)
      INTO v_preserved_count
    FROM public.device_bindings AS binding
    WHERE binding.device_id = p_device_id
      AND binding.user_id = p_auth_user_id
      AND binding.binding_type = 'authenticated_association'
      AND binding.status = 'active';
  END IF;

  SELECT binding.user_id, binding.id
    INTO v_guest_id, v_binding_id
  FROM public.device_bindings AS binding
  WHERE binding.device_id = p_device_id
    AND binding.binding_type = 'active_guest'
    AND binding.status = 'active'
  ORDER BY binding.created_at ASC, binding.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_guest_id IS NOT NULL THEN
    SELECT profile.is_guest, profile.progress_lifecycle
      INTO v_is_guest, v_lifecycle
    FROM public.profiles AS profile
    WHERE profile.id = v_guest_id
    FOR UPDATE;
    v_profile_found := FOUND;

    SELECT EXISTS (
      SELECT 1 FROM public.server_game_state AS state
      WHERE state.user_id = v_guest_id
    ) INTO v_has_state;

    IF NOT v_profile_found OR v_is_guest IS DISTINCT FROM TRUE THEN
      status := CASE
        WHEN NOT v_profile_found THEN 'STATE_RECOVERY_REQUIRED'
        ELSE 'DEVICE_BOUND_TO_OTHER_USER'
      END;
      guest_user_id := NULL;
      binding_id := v_binding_id;
      is_new_guest := FALSE;
      has_game_state := v_has_state;
      preserved_association_count := v_preserved_count;
      error_code := status;
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_lifecycle IS DISTINCT FROM 'active' OR NOT v_has_state THEN
      status := 'STATE_RECOVERY_REQUIRED';
      guest_user_id := v_guest_id;
      binding_id := v_binding_id;
      is_new_guest := FALSE;
      has_game_state := v_has_state;
      preserved_association_count := v_preserved_count;
      error_code := 'STATE_RECOVERY_REQUIRED';
      RETURN NEXT;
      RETURN;
    END IF;

    status := 'OK_EXISTING';
    guest_user_id := v_guest_id;
    binding_id := v_binding_id;
    is_new_guest := FALSE;
    has_game_state := TRUE;
    preserved_association_count := v_preserved_count;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

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
    jsonb_build_object('provider', 'anonymous', 'providers', ARRAY['anonymous']::TEXT[]),
    jsonb_build_object(
      'device_id', p_device_id,
      'is_anonymous', TRUE,
      'signed_out_from_auth', COALESCE(p_auth_user_id::TEXT, '')
    ),
    NOW(),
    NOW(),
    TRUE
  )
  RETURNING id INTO v_guest_id;

  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id = v_guest_id
  FOR UPDATE;

  INSERT INTO public.device_bindings (device_id, user_id, binding_type, status)
  VALUES (p_device_id, v_guest_id, 'active_guest', 'active')
  RETURNING id INTO v_binding_id;

  INSERT INTO public.server_game_state (
    user_id, money, game_tick, game_speed, state_version, full_state, state_hash
  ) VALUES (
    v_guest_id, 0, 0, 1, 1, jsonb_build_object('bootstrap_pending', TRUE), ''
  );

  status := 'OK_CREATED';
  guest_user_id := v_guest_id;
  binding_id := v_binding_id;
  is_new_guest := TRUE;
  has_game_state := TRUE;
  preserved_association_count := v_preserved_count;
  error_code := NULL;
  RETURN NEXT;
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    status := 'RETRYABLE_FAILURE';
    guest_user_id := NULL;
    binding_id := NULL;
    is_new_guest := NULL;
    has_game_state := NULL;
    preserved_association_count := NULL;
    error_code := 'BOOTSTRAP_UNAVAILABLE';
    RETURN NEXT;
    RETURN;
END;
$$;

-- Guest-to-auth ownership transition. This preserves the canonical state row
-- only when the auth profile is proven never_initialized. If both principals
-- have a state row, the function returns ACCOUNT_PROGRESS_CONFLICT without
-- archiving, deleting, combining, or changing either full_state payload.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guest_id UUID;
  v_guest_binding_id UUID;
  v_binding_id UUID;
  v_auth_lifecycle TEXT;
  v_guest_lifecycle TEXT;
  v_auth_is_guest BOOLEAN;
  v_guest_is_guest BOOLEAN;
  v_guest_profile_found BOOLEAN := FALSE;
  v_auth_has_state BOOLEAN := FALSE;
  v_guest_has_state BOOLEAN := FALSE;
BEGIN
  -- p_policy remains in the signature for rollout compatibility. Automatic
  -- archive-and-delete is no longer permitted for either policy value.
  IF p_policy NOT IN ('auth_wins_archive_guest', 'explicit_conflict') THEN
    status := 'STATE_RECOVERY_REQUIRED';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    has_auth_progress := NULL;
    has_guest_progress := NULL;
    bindings_preserved := NULL;
    archive_receipt_id := NULL;
    policy_applied := p_policy;
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM public.lock_identity_device(p_device_id);

  -- Resolve the device owner first, then acquire every affected user/profile/
  -- state lock in UUID order. This avoids opposite-order transfer deadlocks.
  SELECT binding.user_id, binding.id
    INTO v_guest_id, v_guest_binding_id
  FROM public.device_bindings AS binding
  WHERE binding.device_id = p_device_id
    AND binding.binding_type = 'active_guest'
    AND binding.status = 'active'
  ORDER BY binding.created_at ASC, binding.id ASC
  LIMIT 1
  FOR UPDATE;

  -- No guest is present: return/create this auth association idempotently.
  IF v_guest_id IS NULL THEN
    PERFORM public.lock_identity_users(p_auth_user_id);

    SELECT profile.progress_lifecycle, profile.is_guest
      INTO v_auth_lifecycle, v_auth_is_guest
    FROM public.profiles AS profile
    WHERE profile.id = p_auth_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_auth_is_guest IS TRUE THEN
      status := 'STATE_RECOVERY_REQUIRED';
      surviving_user_id := NULL;
      archived_guest_id := NULL;
      has_auth_progress := NULL;
      has_guest_progress := NULL;
      bindings_preserved := NULL;
      archive_receipt_id := NULL;
      policy_applied := p_policy;
      error_code := 'STATE_RECOVERY_REQUIRED';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.server_game_state AS state
      WHERE state.user_id = p_auth_user_id
    ) INTO v_auth_has_state;

    IF (v_auth_lifecycle = 'active' AND NOT v_auth_has_state)
       OR v_auth_lifecycle = 'recovery_required'
       OR v_auth_lifecycle NOT IN ('never_initialized', 'active')
       OR (v_auth_lifecycle = 'never_initialized' AND v_auth_has_state)
    THEN
      status := 'STATE_RECOVERY_REQUIRED';
      surviving_user_id := p_auth_user_id;
      archived_guest_id := NULL;
      has_auth_progress := v_auth_has_state;
      has_guest_progress := FALSE;
      bindings_preserved := NULL;
      archive_receipt_id := NULL;
      policy_applied := p_policy;
      error_code := 'STATE_RECOVERY_REQUIRED';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT binding.id
      INTO v_binding_id
    FROM public.device_bindings AS binding
    WHERE binding.device_id = p_device_id
      AND binding.user_id = p_auth_user_id
      AND binding.binding_type = 'authenticated_association'
      AND binding.status = 'active'
    ORDER BY binding.created_at ASC, binding.id ASC
    LIMIT 1
    FOR UPDATE;

    IF v_binding_id IS NULL THEN
      INSERT INTO public.device_bindings (device_id, user_id, binding_type, status)
      VALUES (p_device_id, p_auth_user_id, 'authenticated_association', 'active')
      RETURNING id INTO v_binding_id;
      status := 'OK_CREATED';
    ELSE
      status := 'OK_EXISTING';
    END IF;

    surviving_user_id := p_auth_user_id;
    archived_guest_id := NULL;
    has_auth_progress := v_auth_has_state;
    has_guest_progress := FALSE;
    bindings_preserved := 1;
    archive_receipt_id := NULL;
    policy_applied := p_policy;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock all two-party resources in the same UUID order after the device row.
  PERFORM public.lock_identity_users(p_auth_user_id, v_guest_id);

  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id IN (p_auth_user_id, v_guest_id)
  ORDER BY profile.id
  FOR UPDATE;

  SELECT profile.progress_lifecycle, profile.is_guest
    INTO v_auth_lifecycle, v_auth_is_guest
  FROM public.profiles AS profile
  WHERE profile.id = p_auth_user_id;

  IF NOT FOUND OR v_auth_is_guest IS TRUE THEN
    status := 'STATE_RECOVERY_REQUIRED';
    surviving_user_id := NULL;
    archived_guest_id := v_guest_id;
    has_auth_progress := NULL;
    has_guest_progress := NULL;
    bindings_preserved := NULL;
    archive_receipt_id := NULL;
    policy_applied := p_policy;
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT profile.progress_lifecycle, profile.is_guest
    INTO v_guest_lifecycle, v_guest_is_guest
  FROM public.profiles AS profile
  WHERE profile.id = v_guest_id;
  v_guest_profile_found := FOUND;

  PERFORM 1
  FROM public.server_game_state AS state
  WHERE state.user_id IN (p_auth_user_id, v_guest_id)
  ORDER BY state.user_id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.server_game_state AS state
    WHERE state.user_id = v_guest_id
  ) INTO v_guest_has_state;

  SELECT EXISTS (
    SELECT 1 FROM public.server_game_state AS state
    WHERE state.user_id = p_auth_user_id
  ) INTO v_auth_has_state;

  IF NOT v_guest_profile_found
     OR v_guest_is_guest IS DISTINCT FROM TRUE
     OR v_guest_lifecycle IS DISTINCT FROM 'active'
     OR NOT v_guest_has_state
     OR (v_auth_lifecycle = 'active' AND NOT v_auth_has_state)
     OR v_auth_lifecycle = 'recovery_required'
     OR v_auth_lifecycle NOT IN ('never_initialized', 'active')
     OR (v_auth_lifecycle = 'never_initialized' AND v_auth_has_state)
  THEN
    status := CASE
      WHEN NOT v_guest_profile_found THEN 'STATE_RECOVERY_REQUIRED'
      WHEN v_guest_is_guest IS DISTINCT FROM TRUE THEN 'DEVICE_BOUND_TO_OTHER_USER'
      ELSE 'STATE_RECOVERY_REQUIRED'
    END;
    surviving_user_id := p_auth_user_id;
    archived_guest_id := v_guest_id;
    has_auth_progress := v_auth_has_state;
    has_guest_progress := v_guest_has_state;
    bindings_preserved := NULL;
    archive_receipt_id := NULL;
    policy_applied := p_policy;
    error_code := status;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Any existing canonical auth state is treated as owned progress. Do not use
  -- money/game_tick heuristics and do not silently merge two state rows.
  IF v_auth_has_state THEN
    status := 'ACCOUNT_PROGRESS_CONFLICT';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := v_guest_id;
    has_auth_progress := TRUE;
    has_guest_progress := TRUE;
    bindings_preserved := 0;
    archive_receipt_id := NULL;
    policy_applied := p_policy;
    error_code := 'ACCOUNT_PROGRESS_CONFLICT';
    RETURN NEXT;
    RETURN;
  END IF;

  -- The auth profile is proven never_initialized and has no state. Transfer
  -- ownership of the existing canonical row without changing full_state or
  -- payload metadata. The superseded guest profile becomes recovery_required
  -- so it can never be misclassified as a fresh account.
  UPDATE public.server_game_state
  SET user_id = p_auth_user_id
  WHERE user_id = v_guest_id;

  UPDATE public.profiles
  SET progress_lifecycle = 'recovery_required'
  WHERE id = v_guest_id
    AND progress_lifecycle = 'active';

  UPDATE public.device_bindings
  SET status = 'superseded',
      superseded_by = p_auth_user_id,
      updated_at = NOW()
  WHERE id = v_guest_binding_id;

  UPDATE public.guest_identities
  SET superseded_at = NOW(),
      superseded_by = p_auth_user_id
  WHERE user_id = v_guest_id
    AND superseded_by IS NULL;

  SELECT binding.id
    INTO v_binding_id
  FROM public.device_bindings AS binding
  WHERE binding.device_id = p_device_id
    AND binding.user_id = p_auth_user_id
    AND binding.binding_type = 'authenticated_association'
    AND binding.status = 'active'
  ORDER BY binding.created_at ASC, binding.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_binding_id IS NULL THEN
    INSERT INTO public.device_bindings (device_id, user_id, binding_type, status)
    VALUES (p_device_id, p_auth_user_id, 'authenticated_association', 'active')
    RETURNING id INTO v_binding_id;
  END IF;

  status := 'OK_ARCHIVED_GUEST';
  surviving_user_id := p_auth_user_id;
  archived_guest_id := v_guest_id;
  has_auth_progress := TRUE;
  has_guest_progress := FALSE;
  bindings_preserved := 1;
  archive_receipt_id := NULL;
  policy_applied := p_policy;
  error_code := NULL;
  RETURN NEXT;
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    status := 'RETRYABLE_FAILURE';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    has_auth_progress := NULL;
    has_guest_progress := NULL;
    bindings_preserved := NULL;
    archive_receipt_id := NULL;
    policy_applied := p_policy;
    error_code := 'BOOTSTRAP_UNAVAILABLE';
    RETURN NEXT;
    RETURN;
END;
$$;

-- Preserve the legacy two-argument signature without preserving its unsafe
-- auto-archive behavior. It delegates to the locked implementation.
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    result.status,
    result.surviving_user_id,
    result.archived_guest_id,
    result.has_auth_progress,
    result.has_guest_progress,
    result.bindings_preserved,
    result.error_code
  FROM public.upgrade_guest_to_auth(
    p_auth_user_id,
    p_device_id,
    'explicit_conflict'
  ) AS result;
$$;

REVOKE EXECUTE ON FUNCTION public.lock_identity_device(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_identity_users(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_guest(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_authenticated(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bootstrap_guest(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_authenticated(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.lock_identity_device(TEXT) IS
  'Transaction-scoped advisory device lock for identity/profile/binding/state creation.';
COMMENT ON FUNCTION public.bootstrap_guest(TEXT, TEXT) IS
  'Locked, idempotent guest bootstrap. Concurrent requests cannot leave orphan auth/profile rows.';
COMMENT ON FUNCTION public.bootstrap_authenticated(UUID, TEXT) IS
  'Locked authenticated device association. Never creates profiles or replacement game state.';
COMMENT ON FUNCTION public.create_signed_out_guest_after_signout(UUID, TEXT) IS
  'Locked sign-out guest creation; preserves authenticated associations and fails closed on inconsistent guest state.';
COMMENT ON FUNCTION public.upgrade_guest_to_auth(UUID, TEXT, TEXT) IS
  'Locked guest-to-auth transfer. Two state owners return ACCOUNT_PROGRESS_CONFLICT; no automatic full_state merge or deletion.';

COMMIT;

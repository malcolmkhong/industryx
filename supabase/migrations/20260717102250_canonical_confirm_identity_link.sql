-- Canonical confirmation for a pending guest-to-auth identity link.
--
-- This wraps the locked guest-to-auth ownership transaction with the pending
-- operation completion and mandatory audit records. The function does not
-- rewrite server_game_state.full_state or its payload metadata.

CREATE OR REPLACE FUNCTION public.confirm_identity_link(
  p_auth_user_id UUID,
  p_device_id TEXT,
  p_operation_id UUID,
  p_idempotency_key TEXT,
  p_actor_ip_hash TEXT DEFAULT NULL,
  p_actor_user_agent TEXT DEFAULT NULL,
  p_actor_fingerprint_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
  status TEXT,
  surviving_user_id UUID,
  archived_guest_id UUID,
  receipt_id UUID,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_guest_id UUID;
  v_operation_auth_id UUID;
  v_operation_status TEXT;
  v_operation_expires_at TIMESTAMPTZ;
  v_operation_risk_score INTEGER;
  v_operation_risk_flags JSONB;
  v_operation_preview JSONB;
  v_operation_device_id TEXT;
  v_device_guest_id UUID;
  v_guest_state_before JSONB;
  v_auth_state_before JSONB;
  v_upgrade RECORD;
  v_receipt_id UUID;
BEGIN
  -- The device lock is acquired before any identity/profile/binding/state
  -- read or write. The operation row is then locked for idempotent terminal
  -- outcome handling.
  PERFORM public.lock_identity_device(p_device_id);

  SELECT
    operation.guest_user_id,
    operation.google_user_id,
    operation.status,
    operation.expires_at,
    operation.risk_score,
    operation.risk_flags,
    operation.preview_version,
    operation.device_id
  INTO
    v_operation_guest_id,
    v_operation_auth_id,
    v_operation_status,
    v_operation_expires_at,
    v_operation_risk_score,
    v_operation_risk_flags,
    v_operation_preview,
    v_operation_device_id
  FROM public.pending_link_operations AS operation
  WHERE operation.id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    status := 'RETRYABLE_FAILURE';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    receipt_id := NULL;
    error_code := 'LINK_OPERATION_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_operation_auth_id IS DISTINCT FROM p_auth_user_id
     OR v_operation_device_id IS DISTINCT FROM p_device_id THEN
    status := 'DEVICE_BOUND_TO_OTHER_USER';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    receipt_id := NULL;
    error_code := 'DEVICE_BOUND_TO_OTHER_USER';
    RETURN NEXT;
    RETURN;
  END IF;

  -- A completed operation is idempotent: return its original receipt without
  -- attempting to find or transfer a guest binding again.
  IF v_operation_status = 'completed' THEN
    SELECT receipt.id
      INTO v_receipt_id
    FROM public.merge_receipts AS receipt
    WHERE receipt.operation_id = p_operation_id
    ORDER BY receipt.created_at ASC, receipt.id ASC
    LIMIT 1;

    status := 'OK_EXISTING';
    surviving_user_id := p_auth_user_id;
    archived_guest_id := v_operation_guest_id;
    receipt_id := v_receipt_id;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_operation_status IS DISTINCT FROM 'pending' THEN
    status := 'RETRYABLE_FAILURE';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    receipt_id := NULL;
    error_code := 'LINK_OPERATION_NOT_PENDING';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_operation_expires_at IS NULL OR v_operation_expires_at <= NOW() THEN
    UPDATE public.pending_link_operations
    SET status = 'expired', completed_at = NOW()
    WHERE id = p_operation_id;

    status := 'RETRYABLE_FAILURE';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    receipt_id := NULL;
    error_code := 'LINK_OPERATION_EXPIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Bind the pending operation to the exact active guest on this device before
  -- calling the canonical transfer. A stale operation must never transfer a
  -- different guest that later reused the same device id.
  SELECT binding.user_id
    INTO v_device_guest_id
  FROM public.device_bindings AS binding
  WHERE binding.device_id = p_device_id
    AND binding.binding_type = 'active_guest'
    AND binding.status = 'active'
  ORDER BY binding.created_at ASC, binding.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_device_guest_id IS DISTINCT FROM v_operation_guest_id THEN
    status := 'DEVICE_BOUND_TO_OTHER_USER';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    receipt_id := NULL;
    error_code := 'DEVICE_BOUND_TO_OTHER_USER';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Match the canonical transfer's lock order before reading snapshots:
  -- auth.users UUID order, profiles UUID order, then state UUID order. This
  -- prevents a confirmation from deadlocking with a concurrent bootstrap or
  -- server-authoritative state write.
  PERFORM public.lock_identity_users(p_auth_user_id, v_operation_guest_id);

  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id IN (p_auth_user_id, v_operation_guest_id)
  ORDER BY profile.id
  FOR UPDATE;

  PERFORM 1
  FROM public.server_game_state AS state
  WHERE state.user_id IN (p_auth_user_id, v_operation_guest_id)
  ORDER BY state.user_id
  FOR UPDATE;

  -- Snapshot for immutable merge history only. The canonical transfer below
  -- changes ownership, not the JSON payload or its metadata.
  SELECT state.full_state
    INTO v_guest_state_before
  FROM public.server_game_state AS state
  WHERE state.user_id = v_operation_guest_id;

  SELECT state.full_state
    INTO v_auth_state_before
  FROM public.server_game_state AS state
  WHERE state.user_id = p_auth_user_id;

  SELECT *
    INTO v_upgrade
  FROM public.upgrade_guest_to_auth(
    p_auth_user_id,
    p_device_id,
    'explicit_conflict'
  );

  IF v_upgrade.status NOT IN ('OK_EXISTING', 'OK_CREATED', 'OK_ARCHIVED_GUEST') THEN
    status := v_upgrade.status;
    surviving_user_id := v_upgrade.surviving_user_id;
    archived_guest_id := v_upgrade.archived_guest_id;
    receipt_id := NULL;
    error_code := v_upgrade.error_code;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_upgrade.archived_guest_id IS DISTINCT FROM v_operation_guest_id
     OR v_upgrade.surviving_user_id IS DISTINCT FROM p_auth_user_id
  THEN
    RAISE EXCEPTION 'canonical upgrade returned unexpected principals';
  END IF;

  INSERT INTO public.merge_receipts (
    operation_id,
    kept_user_id,
    archived_user_id,
    decision_type,
    guest_state_snapshot,
    google_state_snapshot,
    risk_score,
    expires_at
  ) VALUES (
    p_operation_id,
    p_auth_user_id,
    v_operation_guest_id,
    'auth_wins',
    v_guest_state_before,
    v_auth_state_before,
    COALESCE(v_operation_risk_score, 0),
    NOW() + INTERVAL '90 days'
  )
  RETURNING id INTO v_receipt_id;

  INSERT INTO public.merge_audit_log (
    merge_receipt_id,
    idempotency_key,
    guest_user_id,
    google_user_id,
    preference,
    guest_state_before,
    google_state_before,
    guest_state_after,
    google_state_after,
    merge_result,
    preview_version,
    risk_score,
    risk_flags,
    actor_user_id,
    actor_ip_hash,
    actor_ip_region,
    actor_user_agent,
    fingerprint_hash
  ) VALUES (
    v_receipt_id::TEXT,
    p_idempotency_key,
    v_operation_guest_id,
    p_auth_user_id,
    'auth_wins',
    v_guest_state_before,
    v_auth_state_before,
    NULL,
    v_guest_state_before,
    jsonb_build_object(
      'receiptId', v_receipt_id,
      'survivingUserId', p_auth_user_id,
      'decisionType', 'auth_wins',
      'status', v_upgrade.status
    ),
    v_operation_preview,
    COALESCE(v_operation_risk_score, 0),
    COALESCE(v_operation_risk_flags, '[]'::JSONB),
    p_auth_user_id,
    p_actor_ip_hash,
    NULL,
    p_actor_user_agent,
    p_actor_fingerprint_hash
  );

  UPDATE public.pending_link_operations
  SET
    status = 'completed',
    completed_at = NOW(),
    merge_result = jsonb_build_object(
      'receiptId', v_receipt_id,
      'survivingUserId', p_auth_user_id,
      'archivedGuestId', v_operation_guest_id,
      'status', v_upgrade.status
    )
  WHERE id = p_operation_id;

  status := v_upgrade.status;
  surviving_user_id := p_auth_user_id;
  archived_guest_id := v_operation_guest_id;
  receipt_id := v_receipt_id;
  error_code := NULL;
  RETURN NEXT;
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    status := 'RETRYABLE_FAILURE';
    surviving_user_id := NULL;
    archived_guest_id := NULL;
    receipt_id := NULL;
    error_code := 'BOOTSTRAP_UNAVAILABLE';
    RETURN NEXT;
    RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_identity_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_identity_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.confirm_identity_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Operation-aware, locked identity-link confirmation. Delegates guest-to-auth ownership to upgrade_guest_to_auth; two state owners return ACCOUNT_PROGRESS_CONFLICT without a payload merge.';

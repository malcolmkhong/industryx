-- Priority 5: controlled legacy persisted-state recovery ledger.
--
-- This migration is additive. It never rewrites `server_game_state.full_state`
-- and it does not enable strict read enforcement. A recovery conversion is
-- allowed only through `complete_game_state_recovery`, after a server-side
-- service has validated a specifically approved reconstructed ServerGameData
-- payload and calculated its v1 HMAC checksum.

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_state_recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_state_id UUID NOT NULL,
  original_state_version INTEGER NOT NULL CHECK (original_state_version >= 0),
  original_full_state JSONB NOT NULL,
  original_payload_schema_version INTEGER,
  original_payload_lifecycle TEXT,
  original_payload_checksum TEXT,
  detected_schema_condition TEXT NOT NULL CHECK (
    detected_schema_condition IN (
      'bootstrap_pending',
      'full_shape_unverified',
      'partial_legacy',
      'invalid_raw',
      'conflicting_evidence',
      'unknown_progress'
    )
  ),
  evidence_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_classification JSONB NOT NULL DEFAULT '{}'::jsonb,
  recoverable_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  unresolved_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'evidence_collected' CHECK (
    status IN (
      'evidence_collected',
      'manual_review_required',
      'approved',
      'converted',
      'rejected'
    )
  ),
  approved_recovery_method TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  guest_recovery_reference_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_state_recovery_cases_original_state_unique UNIQUE (original_state_id),
  CONSTRAINT game_state_recovery_cases_approval_fields_check CHECK (
    (status <> 'approved' AND status <> 'converted')
    OR (approved_recovery_method IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_game_state_recovery_cases_user_status
  ON public.game_state_recovery_cases (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.game_state_recovery_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.game_state_recovery_cases(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_state_id UUID NOT NULL,
  original_state_version INTEGER NOT NULL CHECK (original_state_version >= 0),
  original_full_state JSONB NOT NULL,
  recovered_state_version INTEGER NOT NULL CHECK (recovered_state_version > 0),
  payload_schema_version INTEGER NOT NULL,
  payload_checksum TEXT NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  recovery_method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_state_recovery_receipts_case_unique UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS idx_game_state_recovery_receipts_user_created
  ON public.game_state_recovery_receipts (user_id, created_at DESC);

ALTER TABLE public.game_state_recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_state_recovery_receipts ENABLE ROW LEVEL SECURITY;

-- No browser policies are intentionally created. These tables hold raw
-- snapshots and recovery references; only the server-side service role may
-- access them until a deliberately scoped support workflow is added.
DROP POLICY IF EXISTS "Service role only game-state recovery cases"
  ON public.game_state_recovery_cases;
CREATE POLICY "Service role only game-state recovery cases"
  ON public.game_state_recovery_cases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only game-state recovery receipts"
  ON public.game_state_recovery_receipts;
CREATE POLICY "Service role only game-state recovery receipts"
  ON public.game_state_recovery_receipts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_game_state_recovery_case_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_state_recovery_case_updated_at
  ON public.game_state_recovery_cases;
CREATE TRIGGER trg_game_state_recovery_case_updated_at
  BEFORE UPDATE ON public.game_state_recovery_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_game_state_recovery_case_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_game_state_recovery_receipt_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'game_state_recovery_receipts are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_game_state_recovery_receipt_immutable
  ON public.game_state_recovery_receipts;
CREATE TRIGGER trg_game_state_recovery_receipt_immutable
  BEFORE UPDATE OR DELETE ON public.game_state_recovery_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_game_state_recovery_receipt_mutation();

CREATE OR REPLACE FUNCTION public.complete_game_state_recovery(
  p_case_id UUID,
  p_user_id UUID,
  p_expected_state_version INTEGER,
  p_full_state JSONB,
  p_payload_checksum TEXT,
  p_denormalized JSONB
)
RETURNS TABLE (
  outcome TEXT,
  recovered_state_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.game_state_recovery_cases%ROWTYPE;
  v_state public.server_game_state%ROWTYPE;
  v_next_state_version INTEGER;
BEGIN
  SELECT * INTO v_case
  FROM public.game_state_recovery_cases
  WHERE id = p_case_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'RECOVERY_CASE_NOT_FOUND'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  IF v_case.status <> 'approved' THEN
    RETURN QUERY SELECT 'RECOVERY_CASE_NOT_APPROVED'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT * INTO v_state
  FROM public.server_game_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'STATE_NOT_FOUND'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  IF v_state.id <> v_case.original_state_id
    OR v_state.state_version <> p_expected_state_version
    OR v_state.state_version <> v_case.original_state_version
    OR v_state.full_state IS DISTINCT FROM v_case.original_full_state THEN
    RETURN QUERY SELECT 'STATE_VERSION_CONFLICT'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  IF p_payload_checksum !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'INVALID_SERVER_PAYLOAD'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  IF jsonb_typeof(p_full_state) <> 'object'
    OR jsonb_typeof(p_denormalized) <> 'object'
    OR NOT (p_denormalized ?& ARRAY[
      'money', 'total_money_earned', 'research_points', 'buildings',
      'buildings_count', 'completed_research', 'resources', 'workers',
      'game_tick', 'game_speed'
    ]) THEN
    RETURN QUERY SELECT 'INVALID_SERVER_PAYLOAD'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  v_next_state_version := v_state.state_version + 1;

  UPDATE public.server_game_state
  SET
    full_state = p_full_state,
    state_hash = p_payload_checksum,
    payload_schema_version = 1,
    payload_lifecycle = 'complete',
    payload_checksum = p_payload_checksum,
    money = (p_denormalized->>'money')::NUMERIC,
    total_money_earned = (p_denormalized->>'total_money_earned')::NUMERIC,
    research_points = (p_denormalized->>'research_points')::NUMERIC,
    buildings = p_denormalized->'buildings',
    buildings_count = (p_denormalized->>'buildings_count')::INTEGER,
    completed_research = p_denormalized->'completed_research',
    resources = p_denormalized->'resources',
    workers = p_denormalized->'workers',
    game_tick = (p_denormalized->>'game_tick')::BIGINT,
    game_speed = (p_denormalized->>'game_speed')::INTEGER,
    state_version = v_next_state_version,
    last_saved_at = NOW()
  WHERE id = v_state.id;

  INSERT INTO public.game_state_recovery_receipts (
    case_id,
    user_id,
    original_state_id,
    original_state_version,
    original_full_state,
    recovered_state_version,
    payload_schema_version,
    payload_checksum,
    recovery_method
  ) VALUES (
    v_case.id,
    v_case.user_id,
    v_case.original_state_id,
    v_case.original_state_version,
    v_case.original_full_state,
    v_next_state_version,
    1,
    p_payload_checksum,
    v_case.approved_recovery_method
  );

  UPDATE public.game_state_recovery_cases
  SET status = 'converted', converted_at = NOW()
  WHERE id = v_case.id;

  RETURN QUERY SELECT 'COMPLETED'::TEXT, v_next_state_version;
END;
$$;

REVOKE ALL ON TABLE public.game_state_recovery_cases FROM anon, authenticated;
REVOKE ALL ON TABLE public.game_state_recovery_receipts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.game_state_recovery_cases TO service_role;
GRANT SELECT ON TABLE public.game_state_recovery_receipts TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_game_state_recovery(UUID, UUID, INTEGER, JSONB, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_game_state_recovery(UUID, UUID, INTEGER, JSONB, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.game_state_recovery_cases IS
  'Server-only evidence ledger for controlled legacy gameplay-state recovery. No player-facing raw snapshot access.';
COMMENT ON TABLE public.game_state_recovery_receipts IS
  'Immutable receipt for a successful legacy gameplay-state recovery conversion.';

COMMIT;

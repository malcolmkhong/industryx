-- Migration 075: Bootstrap Telemetry + Audit Summary
--
-- Per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §19 (Observability) and §21 PR 5:
--   - New `public.bootstrap_telemetry` table captures anonymized client-side
--     bootstrap outcomes for diagnostics.
--   - The `get_bootstrap_telemetry_summary` SECURITY DEFINER function powers
--     the admin audit dashboard at /admin/bootstrap-audit.
--   - No PII is stored: deviceId is a generated UUID (per the client
--     orchestrator), and we deliberately do NOT store email, IP, raw
--     fingerprint, session token, or any user identity beyond user_id when
--     the bootstrap resolve returned one.
--
-- Idempotent: every CREATE/ALTER/CREATE INDEX uses IF NOT EXISTS where
-- supported. Policy drops guard with DROP POLICY IF EXISTS. Function grants
-- are tightened at the end in a DO block (no IF EXISTS for GRANT/REVOKE).

BEGIN;

-- ============================================================================
-- 1. public.bootstrap_telemetry
--    Anonymized bootstrap outcome capture for §19 observability.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bootstrap_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID NULL,
  outcome TEXT NOT NULL,
  source TEXT NULL,
  duration_ms INTEGER NULL,
  fingerprint_status TEXT NULL,
  state_at_emit TEXT NULL,
  is_guest BOOLEAN NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Outcome whitelist (plan §5 state machine + signed_in).
  CONSTRAINT chk_bootstrap_telemetry_outcome
    CHECK (outcome IN (
      'ready',
      'conflict',
      'recovery_required',
      'temporary_error',
      'signed_out',
      'signed_in'
    )),

  -- Source whitelist (matches orchestrator source values per bootstrap result).
  CONSTRAINT chk_bootstrap_telemetry_source
    CHECK (source IS NULL OR source IN (
      'deviceId',
      'auth',
      'fresh',
      'sign_out_to_guest'
    )),

  -- Fingerprint status whitelist (fingerprint telemetry only; never stores value).
  CONSTRAINT chk_bootstrap_telemetry_fingerprint
    CHECK (fingerprint_status IS NULL OR fingerprint_status IN (
      'ok',
      'unavailable',
      'timeout'
    )),

  -- Bounded duration (server-side finite check).
  CONSTRAINT chk_bootstrap_telemetry_duration
    CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 600000)),

  -- Bounded length on state_at_emit (orchestrator state labels are short).
  CONSTRAINT chk_bootstrap_telemetry_state_at_emit
    CHECK (state_at_emit IS NULL OR char_length(state_at_emit) <= 64),

  -- Bounded length on device_id (generated UUID = 36 chars; allow padding for older IDs).
  CONSTRAINT chk_bootstrap_telemetry_device_id
    CHECK (char_length(device_id) BETWEEN 8 AND 128)
);

-- ============================================================================
-- 2. Indexes (DB-008: user_id + created_at, plus outcome for audits)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at
  ON public.bootstrap_telemetry(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_id
  ON public.bootstrap_telemetry(device_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_outcome
  ON public.bootstrap_telemetry(outcome);

-- ============================================================================
-- 3. Row Level Security (DB-002)
--    Direct reads from anon/authenticated are forbidden. Reads must go through
--    the service_role caller (admin RPC) or the SECURITY DEFINER function.
--    Inserts from clients are intentionally blocked: the telemetry endpoint
--    uses the service-role client, not the user client.
-- ============================================================================
ALTER TABLE public.bootstrap_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bootstrap telemetry service_role full access" ON public.bootstrap_telemetry;
CREATE POLICY "Bootstrap telemetry service_role full access"
  ON public.bootstrap_telemetry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- (No anon / authenticated policies: direct client reads are blocked.)
-- Inserts from anon/authenticated are blocked: telemetry writes go through
-- the API route which uses the service-role client.

COMMENT ON TABLE public.bootstrap_telemetry IS
  'Migration 075: anonymized bootstrap outcome telemetry per plan §19. PII-free: only deviceId (generated UUID) and optional auth user_id (when present). No email, IP, fingerprint raw value, or session token is captured.';

-- ============================================================================
-- 4. get_bootstrap_telemetry_summary(p_since TIMESTAMPTZ)
--    Admin audit summary. Returns aggregate counts + percentiles since p_since
--    (default: last 24 hours). Powers /admin/bootstrap-audit.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_bootstrap_telemetry_summary(
  p_since TIMESTAMPTZ DEFAULT (now() - interval '24 hours')
)
RETURNS TABLE (
  total_count BIGINT,
  ready_count BIGINT,
  conflict_count BIGINT,
  recovery_count BIGINT,
  temporary_error_count BIGINT,
  signed_out_count BIGINT,
  signed_in_count BIGINT,
  by_source JSONB,
  p50_duration_ms NUMERIC,
  p95_duration_ms NUMERIC,
  since TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_total BIGINT := 0;
  v_ready BIGINT := 0;
  v_conflict BIGINT := 0;
  v_recovery BIGINT := 0;
  v_temp_err BIGINT := 0;
  v_signed_out BIGINT := 0;
  v_signed_in BIGINT := 0;
  v_by_source JSONB;
  v_p50 NUMERIC := NULL;
  v_p95 NUMERIC := NULL;
BEGIN
  -- Aggregate counts by outcome.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE outcome = 'ready'),
    COUNT(*) FILTER (WHERE outcome = 'conflict'),
    COUNT(*) FILTER (WHERE outcome = 'recovery_required'),
    COUNT(*) FILTER (WHERE outcome = 'temporary_error'),
    COUNT(*) FILTER (WHERE outcome = 'signed_out'),
    COUNT(*) FILTER (WHERE outcome = 'signed_in')
  INTO v_total, v_ready, v_conflict, v_recovery, v_temp_err, v_signed_out, v_signed_in
  FROM public.bootstrap_telemetry
  WHERE created_at >= p_since;

  -- Counts grouped by source (null sources are omitted; orchestrator only
  -- emits null in rare error paths).
  SELECT COALESCE(jsonb_object_agg(src, cnt), '{}'::jsonb)
  INTO v_by_source
  FROM (
    SELECT source AS src, COUNT(*) AS cnt
    FROM public.bootstrap_telemetry
    WHERE created_at >= p_since
      AND source IS NOT NULL
    GROUP BY source
  ) s;

  -- Percentiles from durations (ignore nulls and outliers).
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms),
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
  INTO v_p50, v_p95
  FROM public.bootstrap_telemetry
  WHERE created_at >= p_since
    AND duration_ms IS NOT NULL;

  total_count := v_total;
  ready_count := v_ready;
  conflict_count := v_conflict;
  recovery_count := v_recovery;
  temporary_error_count := v_temp_err;
  signed_out_count := v_signed_out;
  signed_in_count := v_signed_in;
  by_source := v_by_source;
  p50_duration_ms := v_p50;
  p95_duration_ms := v_p95;
  since := p_since;
  until_ts := now();
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.get_bootstrap_telemetry_summary(TIMESTAMPTZ) IS
  'Migration 075: admin audit summary for /admin/bootstrap-audit. SECURITY DEFINER; grants limited to service_role.';

-- ============================================================================
-- 5. Service-role grant + revoke PUBLIC/anon/authenticated.
--    Mirrors migration 074 pattern. Done at the end so the function exists.
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_bootstrap_telemetry_summary(TIMESTAMPTZ) TO service_role;

DO $revoke_telemetry_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'get_bootstrap_telemetry_summary') THEN
    REVOKE EXECUTE ON FUNCTION public.get_bootstrap_telemetry_summary(TIMESTAMPTZ) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.get_bootstrap_telemetry_summary(TIMESTAMPTZ) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.get_bootstrap_telemetry_summary(TIMESTAMPTZ) FROM authenticated;
  END IF;
END
$revoke_telemetry_grants$;

COMMIT;

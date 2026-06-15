-- Migration 021: Capture merge infrastructure tables
--
-- These tables exist in the live DB but have no migration file.
-- They support the guest-to-Google account merge flow.

-- ============================================================================
-- 1. pending_link_operations table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pending_link_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id UUID NOT NULL,
  google_user_id UUID,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_hash TEXT,
  ip_region TEXT,
  user_agent TEXT,
  risk_score INTEGER DEFAULT 0,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  preference TEXT,
  preview_version JSONB,
  merge_result JSONB,
  confirmed_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE public.pending_link_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own pending link operations" ON public.pending_link_operations;
CREATE POLICY "Users can read own pending link operations" ON public.pending_link_operations
  FOR SELECT USING ((auth.uid() = guest_user_id) OR (auth.uid() = google_user_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plo_guest_user_id ON public.pending_link_operations(guest_user_id);
CREATE INDEX IF NOT EXISTS idx_plo_google_user_id ON public.pending_link_operations(google_user_id);
CREATE INDEX IF NOT EXISTS idx_plo_idempotency_key ON public.pending_link_operations(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_plo_status ON public.pending_link_operations(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_plo_expires_at ON public.pending_link_operations(expires_at);


-- ============================================================================
-- 2. merge_receipts table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.merge_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL,
  kept_user_id UUID NOT NULL,
  archived_user_id UUID,
  decision_type TEXT NOT NULL,
  guest_state_snapshot JSONB,
  google_state_snapshot JSONB,
  risk_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + '90 days'::interval)
);

-- RLS
ALTER TABLE public.merge_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.merge_receipts;
DROP POLICY IF EXISTS "Users can read their own receipts" ON public.merge_receipts;

CREATE POLICY "Service role full access" ON public.merge_receipts
  FOR ALL USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Users can read their own receipts" ON public.merge_receipts
  FOR SELECT USING ((auth.uid() = kept_user_id) OR (auth.uid() = archived_user_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mr_operation_id ON public.merge_receipts(operation_id);
CREATE INDEX IF NOT EXISTS idx_mr_kept_user_id ON public.merge_receipts(kept_user_id);
CREATE INDEX IF NOT EXISTS idx_mr_archived_user_id ON public.merge_receipts(archived_user_id);


-- ============================================================================
-- 3. merge_audit_log table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.merge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_receipt_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  guest_user_id UUID NOT NULL,
  google_user_id UUID NOT NULL,
  preference TEXT NOT NULL,
  guest_state_before JSONB,
  google_state_before JSONB,
  guest_state_after JSONB,
  google_state_after JSONB,
  merge_result JSONB,
  preview_version JSONB,
  risk_score INTEGER DEFAULT 0,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  actor_user_id UUID NOT NULL,
  actor_ip_hash TEXT,
  actor_ip_region TEXT,
  actor_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.merge_audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log is service-role only (no user access)
DROP POLICY IF EXISTS "Service role full access on merge_audit_log" ON public.merge_audit_log;
CREATE POLICY "Service role full access on merge_audit_log" ON public.merge_audit_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mal_merge_receipt_id ON public.merge_audit_log(merge_receipt_id);
CREATE INDEX IF NOT EXISTS idx_mal_guest_user_id ON public.merge_audit_log(guest_user_id);
CREATE INDEX IF NOT EXISTS idx_mal_google_user_id ON public.merge_audit_log(google_user_id);
CREATE INDEX IF NOT EXISTS idx_mal_idempotency_key ON public.merge_audit_log(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_mal_created_at ON public.merge_audit_log(created_at DESC);


-- ============================================================================
-- 4. expire_stale_pending_operations function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_pending_operations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_expired INTEGER;
BEGIN
  UPDATE public.pending_link_operations
  SET status = 'expired',
      completed_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$function$;

-- Lock down grants
REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_operations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_operations() TO service_role;

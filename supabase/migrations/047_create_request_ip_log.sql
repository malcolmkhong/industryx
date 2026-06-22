-- Migration 047: Create request_ip_log table for IP analytics
-- Phase 1 — Foundation (Storage + Audit)
-- No pre-check needed (new table)
-- This table is for ANALYTICS ONLY. IP is NEVER used for bans or locks.

CREATE TABLE IF NOT EXISTS public.request_ip_log (
  id bigserial PRIMARY KEY,
  endpoint text NOT NULL,
  ip_hash text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_ip_log_ip_hash
  ON public.request_ip_log (ip_hash);

CREATE INDEX IF NOT EXISTS idx_request_ip_log_created_at
  ON public.request_ip_log (created_at DESC);

ALTER TABLE public.request_ip_log ENABLE ROW LEVEL SECURITY;

-- Only service_role may write/read. anon and authenticated have no access.
DROP POLICY IF EXISTS "Service role manages request_ip_log" ON public.request_ip_log;
CREATE POLICY "Service role manages request_ip_log"
  ON public.request_ip_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

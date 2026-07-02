-- Migration 042: Add fingerprint_hash to merge_audit_log
-- Phase 1 — Foundation (Storage + Audit)
-- Pre-check: confirm column does not exist; table has 0 rows; additive

ALTER TABLE public.merge_audit_log
  ADD COLUMN IF NOT EXISTS fingerprint_hash text;

CREATE INDEX IF NOT EXISTS idx_merge_audit_log_fingerprint_hash
  ON public.merge_audit_log (fingerprint_hash)
  WHERE fingerprint_hash IS NOT NULL;

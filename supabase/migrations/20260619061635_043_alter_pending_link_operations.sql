-- Migration 043: Add fingerprint_hash and device_id to pending_link_operations
-- Phase 1 — Foundation (Storage + Audit)
-- Pre-check: confirm columns do not exist; table has 0 rows; additive

ALTER TABLE public.pending_link_operations
  ADD COLUMN IF NOT EXISTS fingerprint_hash text,
  ADD COLUMN IF NOT EXISTS device_id text;

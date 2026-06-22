-- Migration 041: Add fingerprint_hash and device_id to cheat_investigations
-- Phase 1 — Foundation (Storage + Audit)
-- Pre-check: confirm columns do not exist; table has 6 rows; additive, NULL default

ALTER TABLE public.cheat_investigations
  ADD COLUMN IF NOT EXISTS fingerprint_hash text,
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS idx_cheat_investigations_fingerprint_hash
  ON public.cheat_investigations (fingerprint_hash)
  WHERE fingerprint_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cheat_investigations_device_id
  ON public.cheat_investigations (device_id)
  WHERE device_id IS NOT NULL;

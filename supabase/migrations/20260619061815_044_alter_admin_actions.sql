-- Migration 044: Add ip_address, target_id, payload to admin_actions
-- Phase 1 — Foundation (Storage + Audit)
-- Pre-check: confirm columns do not exist; table has 3 rows; additive
-- Closes F-5 (silent audit-log write failure: code writes `ip_address`,
-- `target_id`, `payload`; columns don't exist; insert succeeds with NULL).

ALTER TABLE public.admin_actions
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb;

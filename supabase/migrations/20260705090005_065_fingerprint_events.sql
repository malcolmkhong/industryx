-- 065_fingerprint_events.sql
-- Append-only event log for fingerprint outcomes.
-- Answers: which browsers / extensions / versions cause failures,
--          are failures spiking after SDK updates,
--          how many users are affected.
--
-- Service-role write only. No client access. Analytics-only.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.fingerprint_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL CHECK (status IN ('available','unavailable')),
  reason      TEXT NOT NULL CHECK (reason IN
                ('blocked','timeout','network','unsupported','unknown')),
  user_agent  TEXT,
  platform    TEXT
);

CREATE INDEX IF NOT EXISTS idx_fp_events_user
  ON public.fingerprint_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fp_events_reason
  ON public.fingerprint_events(reason, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fp_events_recent
  ON public.fingerprint_events(created_at DESC);

ALTER TABLE public.fingerprint_events ENABLE ROW LEVEL SECURITY;

-- No client policies: service-role only.
-- (RLS still enabled so future admin reads require explicit grants.)
REVOKE ALL ON public.fingerprint_events FROM PUBLIC;
REVOKE ALL ON public.fingerprint_events FROM anon;
REVOKE ALL ON public.fingerprint_events FROM authenticated;
GRANT ALL ON public.fingerprint_events TO service_role;

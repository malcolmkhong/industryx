-- 064_profiles_fingerprint_status.sql
-- Tracks whether each user has a usable device fingerprint.
-- 'available'   → real fingerprint was captured on signup/recent visit
-- 'unavailable' → fingerprint compute failed (ad-blocker, browser policy, etc.)
-- 'pending'     → reserved (e.g., a retry is in flight)
-- 'disabled'    → reserved (e.g., user disabled fingerprinting in settings)
--
-- Idempotent.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fingerprint_status TEXT
    NOT NULL DEFAULT 'available'
    CHECK (fingerprint_status IN ('available','unavailable','pending','disabled'));

CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint_status
  ON public.profiles(fingerprint_status)
  WHERE fingerprint_status = 'unavailable';

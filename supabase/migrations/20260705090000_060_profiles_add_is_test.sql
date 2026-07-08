-- 060_profiles_add_is_test.sql
-- Tier 2 fix 5: add is_test column to profiles.
-- Test/development accounts (detected by deviceId pattern) get is_test=true.
-- cleanup_orphan_anon_users (061+062) deletes test accounts after 1 day
-- of inactivity, regular guests after 30 days.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, partial index IF NOT EXISTS.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index for the cleanup query (only true rows are interesting).
CREATE INDEX IF NOT EXISTS idx_profiles_is_test_true
  ON public.profiles(id) WHERE is_test = true;

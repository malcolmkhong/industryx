-- Migration 027: Add updated_at column to profiles table
--
-- Bug: Migration 020 created handle_new_user() trigger that INSERTs into
-- profiles with an updated_at column. But the profiles table never
-- had updated_at, so every new user signup fails with
-- "column 'updated_at' does not exist".
--
-- This migration adds the missing column and creates an auto-update
-- trigger to maintain it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Auto-maintain updated_at on row changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Verify the column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'Migration 027 failed: updated_at column was not created on profiles';
  END IF;
END $$;

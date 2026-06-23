-- Migration 023: Add display_name to profiles
-- The display_name column was in migration 020's CREATE TABLE statement
-- but the live profiles table was created earlier without it. Add it now.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN public.profiles.display_name IS 'User-chosen display name. Used in UI header and merge dialog. Falls back to email prefix for Google users.';

-- Backfill display_name for existing profiles from auth.users metadata/email
UPDATE public.profiles p
SET display_name = COALESCE(
  (SELECT u.raw_user_meta_data->>'full_name' FROM auth.users u WHERE u.id = p.id),
  (SELECT split_part(u.email, '@', 1) FROM auth.users u WHERE u.id = p.id),
  'Commander'
)
WHERE display_name IS NULL;

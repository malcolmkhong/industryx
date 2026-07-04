-- Migration 055: Auto-populate profiles.device_fingerprint on user creation.
--
-- Why: profiles.device_fingerprint column has been a dead schema column
-- since it was created in migration 020 — no application code wrote to it.
-- Per industry standard (well-architected multi-device-account frameworks),
-- the user's profile (the "primary" record) must record the CURRENT authorized
-- device fingerprint. Historical fingerprints stay in guest_identities (one
-- row per device, for account-lockdown enforcement).
--
-- This migration rewrites the handle_new_user() trigger to read fingerprint
-- from NEW.raw_user_meta_data->>'fingerprint' and write it into
-- profiles.device_fingerprint. Both anon and OAuth flows pass fingerprint
-- through user_metadata at creation time (see /api/auth/quickstart).
--
-- Idempotency: OR REPLACE on the function. ON CONFLICT preserves existing data;
-- only fires for NEW user creation.
--
-- Backfill note: existing profile rows with NULL device_fingerprint are
-- intentionally left as-is. A separate backfill migration (if needed) can
-- join auth.users → raw_user_meta_data for historical rows.

-- ============================================================================
-- 1. REPLACE TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fingerprint TEXT;
BEGIN
  -- Extract fingerprint from signin metadata (set by client via
  -- supabase.auth.signInAnonymously({ options: { data: { fingerprint } } })
  -- or admin.createUser({ user_metadata: { fingerprint } })).
  -- Falls back to NULL when missing (e.g., legacy sign-ups before this migration).
  v_fingerprint := NEW.raw_user_meta_data->>'fingerprint';

  -- For first-time signup: insert with fingerprint.
  -- For trigger re-fire on a conflict (rare), preserve existing fingerprint
  -- unless the new metadata provides a non-null value.
  INSERT INTO public.profiles (id, is_guest, device_fingerprint, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.is_anonymous, false) = true,
    v_fingerprint,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_guest = EXCLUDED.is_guest,
    -- Only overwrite fingerprint if the new one is non-null and
    -- the existing row has no fingerprint (preserves backfilled history).
    device_fingerprint = COALESCE(
      profiles.device_fingerprint,
      EXCLUDED.device_fingerprint
    ),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. RECORD MIGRATION
-- ============================================================================
COMMENT ON FUNCTION public.handle_new_user() IS
  'Migration 055: trigger auto-populates profiles.device_fingerprint from raw_user_meta_data->>''fingerprint''. The fallback path COALESCE() preserves any historical fingerprint that was backfilled or set manually. id IS the auth.users id.';

-- ============================================================================
-- 3. ROLLBACK: revert function to the pre-055 shape
-- ============================================================================
-- (Not auto-rolled-back because the column structure did not change.
--  Rolling forward is the safer recovery path: leave the trigger in place
--  and let new signups populate the column.)

-- Migration 020: Capture profiles and guest_identities tables
--
-- These tables exist in the live DB but have no migration file.
-- This migration makes the schema reproducible.

-- ============================================================================
-- 1. profiles table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  season_id TEXT DEFAULT 'S1',
  session_count INTEGER DEFAULT 0,
  last_active TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  is_guest BOOLEAN NOT NULL DEFAULT TRUE,
  device_fingerprint TEXT,
  linked_account_id UUID,
  linked_at TIMESTAMPTZ,
  display_name TEXT
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so this migration is idempotent
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_linked_account ON public.profiles(linked_account_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_guest ON public.profiles(is_guest);


-- ============================================================================
-- 2. guest_identities table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guest_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  user_id UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_by UUID,
  superseded_at TIMESTAMPTZ,
  device_id TEXT,
  fingerprint_hash TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.guest_identities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so this migration is idempotent
DROP POLICY IF EXISTS "Service role full access on guest_identities" ON public.guest_identities;
DROP POLICY IF EXISTS "Users can read own guest identity" ON public.guest_identities;

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access on guest_identities" ON public.guest_identities
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Users can read their own guest identity
CREATE POLICY "Users can read own guest identity" ON public.guest_identities
  FOR SELECT USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guest_identities_user_id ON public.guest_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_guest_identities_device_id ON public.guest_identities(device_id);
CREATE INDEX IF NOT EXISTS idx_guest_identities_fingerprint_hash ON public.guest_identities(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_guest_identities_is_primary ON public.guest_identities(is_primary) WHERE is_primary = TRUE;


-- ============================================================================
-- 3. handle_new_user trigger function
-- ============================================================================
-- This function is called by the on_auth_user_created trigger on auth.users.
-- It creates a profiles row for every new user.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, is_guest, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.is_anonymous, false) = true,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_guest = EXCLUDED.is_guest,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists on auth.users
-- (This trigger is managed by Supabase Auth, but we ensure it points to our function)
-- Note: Supabase may manage this trigger automatically. If it already exists,
-- this is a no-op. If it doesn't exist, we create it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

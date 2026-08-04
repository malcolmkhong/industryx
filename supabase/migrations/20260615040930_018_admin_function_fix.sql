-- Migration 018: Fix is_game_admin(), lock down guest_identities RLS,
-- lock down increment_cheat_flag grants, seed admin_users
--
-- Fixes:
-- 1. is_game_admin() was hardcoded to one UID. Now queries admin_users.
-- 2. guest_identities had USING (true) — insecure. Now uses auth.role() = 'service_role'.
-- 3. increment_cheat_flag was callable by PUBLIC/anon/authenticated. Now service_role only.
-- 4. admin_users table had no rows. Seed the bootstrap admin.

-- Defensive table creates: see the analogous note in
-- 20260611114348_tradable_resources.sql — guest_identities (020) and
-- admin_users (006) are created by migrations that sort AFTER this file.
-- The shadow DB used by `db diff --linked --use-pg-schema` replays in
-- alphabetical order, so without these preambles the statements below
-- fail. The CREATEs match the canonical bootstrap schemas and are
-- no-ops on linked instances.
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ============================================================================
-- 1. Fix is_game_admin() to actually consult admin_users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_game_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  )
  OR auth.uid()::text = '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';  -- bootstrap env-var UID
END;
$$;

-- Lock down grants
REVOKE EXECUTE ON FUNCTION public.is_game_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_game_admin() TO service_role;


-- ============================================================================
-- 2. Lock down guest_identities RLS
-- ============================================================================
DROP POLICY IF EXISTS "Service role full access on guest_identities" ON guest_identities;
CREATE POLICY "Service role full access on guest_identities" ON guest_identities
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');


-- ============================================================================
-- 3. Lock down increment_cheat_flag grants
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(uuid, text, text, text) TO service_role;


-- ============================================================================
-- 4. Seed admin_users table
-- Guarded: hardcoding production admin UUIDs in a migration is a security
-- anti-pattern. On fresh local DBs the auth.users table is empty — skip the
-- seed and let admins grant themselves access via the admin UI / SQL.
-- (Same fix as migration 004's PART 10 admin seed.)
-- ============================================================================
DO $admin_seed$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '1b4d0dc3-e4d2-4fc0-b731-9782243ad061') THEN
    INSERT INTO public.admin_users (user_id, email, role)
    VALUES ('1b4d0dc3-e4d2-4fc0-b731-9782243ad061', 'malcolmkhong@gmail.com', 'super_admin')
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    RAISE NOTICE '[018] auth user 1b4d0dc3-... not present (fresh local DB) — skipping admin seed. Add admin via UI or SQL.';
  END IF;
END
$admin_seed$;

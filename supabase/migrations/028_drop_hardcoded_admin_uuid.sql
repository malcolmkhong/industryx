-- Migration 028: Remove hardcoded admin UUID from is_game_admin()
--
-- The hardcoded UUID '1b4d0dc3-e4d2-4fc0-b731-9782243ad061' was a
-- bootstrap escape hatch for the very first admin before admin_users
-- table had any rows. The admin_users table now has this UUID as a
-- real row (role=super_admin, email=malcolmkhong@gmail.com), so the
-- hardcoded fallback is redundant AND a security anti-pattern:
-- emptying admin_users would still grant access via the OR clause.
--
-- proxy also has the same UUID via ADMIN_UIDS env var as a
-- bootstrap safety net, so removing it from the function is safe.

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
  );
END;
$$;

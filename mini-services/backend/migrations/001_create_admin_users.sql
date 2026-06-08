-- Migration: Create admin_users table
-- Phase: 1 — Auth & Security
-- Description: Table for managing authorized admin users for IndustriaX Backend

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin', 'viewer')),
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comment to table
COMMENT ON TABLE public.admin_users IS 'Authorized admin users for IndustriaX Backend access control';

-- Add comments to columns
COMMENT ON COLUMN public.admin_users.id IS 'Unique identifier for the admin record';
COMMENT ON COLUMN public.admin_users.user_id IS 'Reference to auth.users — the Supabase auth user';
COMMENT ON COLUMN public.admin_users.email IS 'Email address of the admin user (denormalized for quick lookup)';
COMMENT ON COLUMN public.admin_users.role IS 'Admin role: admin, super_admin, or viewer';
COMMENT ON COLUMN public.admin_users.added_by IS 'User ID of the admin who added this user';
COMMENT ON COLUMN public.admin_users.created_at IS 'Timestamp when the admin record was created';

-- Enable Row Level Security
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Only super_admins can view all admin users
CREATE POLICY "Super admins can view all admin users"
  ON public.admin_users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
    )
  );

-- Policy: Admins can view their own record
CREATE POLICY "Admins can view their own record"
  ON public.admin_users
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Only super_admins can insert new admin users
CREATE POLICY "Super admins can insert admin users"
  ON public.admin_users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
    )
  );

-- Policy: Only super_admins can update admin users
CREATE POLICY "Super admins can update admin users"
  ON public.admin_users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
    )
  );

-- Policy: Only super_admins can delete admin users
CREATE POLICY "Super admins can delete admin users"
  ON public.admin_users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
    )
  );

-- Index for quick user_id lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);

-- Insert the initial admin user (from ADMIN_UIDS env var)
-- Replace '1b4d0dc3-e4d2-4fc0-b731-9782243ad061' with the actual admin UID
-- and 'admin@industriax.com' with the actual admin email
INSERT INTO public.admin_users (user_id, email, role)
VALUES (
  '1b4d0dc3-e4d2-4fc0-b731-9782243ad061',
  'admin@industriax.com',
  'super_admin'
) ON CONFLICT (user_id) DO NOTHING;

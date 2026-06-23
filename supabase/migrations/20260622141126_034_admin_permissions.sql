-- ============================================================================
-- Migration 034: Granular admin permissions (RBAC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(admin_user_id, permission)
);

CREATE INDEX idx_admin_permissions_user ON admin_permissions(admin_user_id);

-- Grant super_admins all permissions by default
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON admin_permissions;
CREATE POLICY "Service role full access"
  ON admin_permissions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

// ============================================
// src/lib/db/adminPermissions.ts
// Admin permission grants â€” CRUD on admin_permissions table.
// Used by src/lib/auth/permissions.ts (the policy/auth module).
// ============================================

import { getDbClient } from "@/lib/db/access";

const VALID_PERMISSIONS = [
  'view_players',
  'lock_players',
  'edit_config',
  'manage_admins',
  'view_audit',
  'manage_market',
  'manage_investigations',
  'view_economy',
] as const;

export type DbPermission = (typeof VALID_PERMISSIONS)[number];

export function getValidPermissions(): readonly string[] {
  return VALID_PERMISSIONS;
}

/**
 * List all permission strings granted to an admin user.
 * Returns [] if the user has no permissions, the DB is unreachable, or
 * the user is not found.
 */
export async function listPermissionsForAdmin(
  adminUserId: string,
): Promise<DbPermission[]> {
  const supabase = getDbClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('admin_permissions')
    .select('permission')
    .eq('admin_user_id', adminUserId);

  return (data || []).map((r) => r.permission as DbPermission);
}

/**
 * Check whether an admin user has a specific permission grant.
 * Returns false on any error (DB unreachable, no row, etc.) â€” caller
 * should treat false as "not authorized".
 */
export async function adminHasPermission(
  adminUserId: string,
  permission: DbPermission,
): Promise<boolean> {
  const supabase = getDbClient();
  if (!supabase) return false;

  const { count, error } = await supabase
    .from('admin_permissions')
    .select('*', { count: 'exact', head: true })
    .eq('admin_user_id', adminUserId)
    .eq('permission', permission);

  return !error && (count ?? 0) > 0;
}

/**
 * Grant a permission to an admin user. Upserts so re-granting the same
 * permission is a no-op (rather than a unique-constraint violation).
 */
export async function grantPermission(
  adminUserId: string,
  permission: DbPermission,
  grantedBy: string,
): Promise<boolean> {
  const supabase = getDbClient();
  if (!supabase) return false;

  const { error } = await supabase.from('admin_permissions').upsert({
    admin_user_id: adminUserId,
    permission,
    granted_by: grantedBy,
  });

  return !error;
}

/**
 * Revoke a permission from an admin user.
 * Returns true if the row was deleted (or didn't exist), false on error.
 */
export async function revokePermission(
  adminUserId: string,
  permission: DbPermission,
): Promise<boolean> {
  const supabase = getDbClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('admin_permissions')
    .delete()
    .eq('admin_user_id', adminUserId)
    .eq('permission', permission);

  return !error;
}

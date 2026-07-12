// ============================================
// src/lib/auth/permissions.ts
// Auth/policy module for admin permissions.
//
// All data access is delegated to src/lib/db/adminPermissions.ts (the
// data-access layer). This file is the policy layer: it re-exports the
// typed Permission enum and provides thin wrappers that callers in
// src/app/api/admin/** import.
// ============================================

import {
  adminHasPermission,
  getValidPermissions,
  grantPermission as grantPermissionDb,
  listPermissionsForAdmin,
  revokePermission as revokePermissionDb,
  type DbPermission,
} from '@/lib/db/admin/adminPermissions';

// Re-export the valid permission list (single source of truth).
export { getValidPermissions };

export type Permission = DbPermission;

/**
 * List all permission strings granted to an admin user.
 */
export function getUserPermissions(userId: string): Promise<Permission[]> {
  return listPermissionsForAdmin(userId);
}

/**
 * Check whether an admin user has a specific permission grant.
 */
export function hasPermission(
  userId: string,
  permission: Permission,
): Promise<boolean> {
  return adminHasPermission(userId, permission);
}

/**
 * Grant a permission to an admin user.
 */
export function grantPermission(
  adminUserId: string,
  permission: Permission,
  grantedBy: string,
): Promise<boolean> {
  return grantPermissionDb(adminUserId, permission, grantedBy);
}

/**
 * Revoke a permission from an admin user.
 */
export function revokePermission(
  adminUserId: string,
  permission: Permission,
): Promise<boolean> {
  return revokePermissionDb(adminUserId, permission);
}

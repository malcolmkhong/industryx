/**
 * Admin helper utilities for game admin API routes.
 * Provides role checking and audit logging functions.
 *
 * Iteration 2 of the Database Centralization migration (2026-06-20):
 *   - getAdminRole() now delegates to `@/lib/db/admins` (getAdminRoleByUserId).
 *   - logAdminAction() now delegates to `@/lib/db/adminActions`.
 *   - canWrite() and hasRole() are pure functions, unchanged.
 */

import type { AdminUser } from "@/lib/auth/admin";
import {
  getAdminRoleByUserId,
  isAdminUserIdInEnv,
} from "@/lib/db/admins";
import { logAdminAction } from "@/lib/db/adminActions";

/**
 * Get the role of an admin user from the admin_users table.
 * Falls back to checking ADMIN_UIDS env var for super_admin status.
 *
 * Behavior preserved exactly from pre-migration:
 *   - If admin_users row has a role → return it
 *   - Else if userId is in ADMIN_UIDS env → return "super_admin"
 *   - Else → return "viewer" (default for safety)
 */
export async function getAdminRole(admin: AdminUser): Promise<string> {
  const role = await getAdminRoleByUserId(admin.id);
  if (role) {
    return role;
  }

  // If not in DB but in ADMIN_UIDS, assume super_admin
  if (isAdminUserIdInEnv(admin.id)) {
    return "super_admin";
  }

  // Default to viewer for safety
  return "viewer";
}

/**
 * Check if an admin has permission to perform write operations.
 * Viewers cannot lock/unlock, resolve investigations, etc.
 */
export function canWrite(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * Check if an admin has a specific role or higher.
 * Role hierarchy: super_admin > admin > viewer
 */
export function hasRole(role: string, required: 'viewer' | 'admin' | 'super_admin'): boolean {
  const hierarchy: Record<string, number> = {
    viewer: 1,
    admin: 2,
    super_admin: 3,
  };
  return (hierarchy[role] ?? 0) >= (hierarchy[required] ?? 0);
}

// Re-export logAdminAction from @/lib/db/adminActions so existing
// imports `import { logAdminAction } from '@/lib/auth/admin-helpers'`
// continue to work unchanged.
export { logAdminAction };

/**
 * Admin helper utilities for game admin API routes.
 * Provides role checking and audit logging functions.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/auth/admin";

/**
 * Get the role of an admin user from the admin_users table.
 * Falls back to checking ADMIN_UIDS env var for super_admin status.
 */
export async function getAdminRole(admin: AdminUser): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", admin.id)
    .single();

  if (data?.role) {
    return data.role;
  }

  // If not in DB but in ADMIN_UIDS, assume super_admin
  const envAdminUids = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);

  if (envAdminUids.includes(admin.id)) {
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
 * Log an admin action to the admin_actions audit table.
 * Schema: admin_user_id, target_user_id, action_type, details, created_at
 */
export async function logAdminAction(params: {
  adminId: string;
  actionType: string;
  targetUserId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("admin_actions").insert({
      admin_user_id: params.adminId,
      target_user_id: params.targetUserId ?? null,
      action_type: params.actionType,
      details: params.details ?? {},
    });

    if (error) {
      console.error("[AdminHelpers] Failed to log admin action:", error.message);
    }
  } catch (err) {
    console.error("[AdminHelpers] Error logging admin action:", err);
  }
}

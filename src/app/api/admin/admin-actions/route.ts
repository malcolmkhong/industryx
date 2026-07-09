/**
 * GET /api/admin/admin-actions
 * List admin action audit trail with filters and pagination.
 * Iteration 8: routed through db/adminActions.ts and db/adminUsers.ts.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { listAdminActionsWithFilters } from "@/lib/db/adminActions";
import { listAllAuthUsers } from "@/lib/db/adminUsers";
import { listAdmins } from "@/lib/db/admins";

export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const url = new URL(request.url);
  const adminUserId = url.searchParams.get("admin_user_id") || "";
  const targetUserId = url.searchParams.get("target_user_id") || "";
  const actionType = url.searchParams.get("action_type") || "";
  const dateFrom = url.searchParams.get("date_from") || "";
  const dateTo = url.searchParams.get("date_to") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  const { actions, total } = await listAdminActionsWithFilters(page, limit, {
    adminUserId: adminUserId || undefined,
    targetUserId: targetUserId || undefined,
    actionType: actionType || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  // Batch lookup admin emails
  const adminUserIds = [
    ...new Set(
      actions
        .map((a) => a.admin_user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const adminEmailMap: Record<string, string> = {};
  if (adminUserIds.length > 0) {
    const admins = await listAdmins();
    for (const a of admins) {
      if (adminUserIds.includes(a.user_id)) adminEmailMap[a.user_id] = a.email;
    }
    const missing = adminUserIds.filter((id) => !adminEmailMap[id]);
    if (missing.length > 0) {
      const authUsers = await listAllAuthUsers();
      for (const u of authUsers) {
        if (missing.includes(u.id) && u.email) adminEmailMap[u.id] = u.email;
      }
    }
  }

  // Batch lookup target user emails
  const targetUserIds = [
    ...new Set(
      actions
        .map((a) => a.target_user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const targetEmailMap: Record<string, string> = {};
  if (targetUserIds.length > 0) {
    const authUsers = await listAllAuthUsers();
    for (const u of authUsers) {
      if (targetUserIds.includes(u.id) && u.email) targetEmailMap[u.id] = u.email;
    }
  }

  const enrichedActions = actions.map((action) => ({
    ...action,
    admin_email: adminEmailMap[action.admin_user_id as string] || null,
    target_email: targetEmailMap[action.target_user_id as string] || null,
  }));

  const totalPages = Math.ceil(total / limit);

  const response = NextResponse.json({
    data: enrichedActions,
    pagination: { page, limit, total, totalPages },
  });
  return withSecurityHeaders(response);
}
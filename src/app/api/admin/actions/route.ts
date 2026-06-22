/**
 * GET /api/admin/actions
 * Player action audit log with filters and pagination.
 * Iteration 8: routed through db/playerActions.ts and db/adminUsers.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { listPlayerActionsWithFilters } from "@/lib/db/playerActions";
import { filterAuthUsersByIds } from "@/lib/db/adminUsers";

export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const url = new URL(request.url);

  const userId = url.searchParams.get("user_id") || "";
  const actionType = url.searchParams.get("action_type") || "";
  const isValidParam = url.searchParams.get("is_valid") || "";
  const dateFrom = url.searchParams.get("date_from") || "";
  const dateTo = url.searchParams.get("date_to") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  let isValid: boolean | undefined;
  if (isValidParam === "true") isValid = true;
  else if (isValidParam === "false") isValid = false;

  const { actions, total } = await listPlayerActionsWithFilters(page, limit, {
    userId: userId || undefined,
    actionType: actionType || undefined,
    isValid,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const uniqueUserIds = [
    ...new Set(
      actions
        .map((a) => a.user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const emailMap = await filterAuthUsersByIds(uniqueUserIds);

  const enrichedActions = actions.map((action) => ({
    ...action,
    user_email: emailMap[action.user_id as string] || null,
  }));

  const totalPages = Math.ceil(total / limit);

  const response = NextResponse.json({
    data: enrichedActions,
    pagination: { page, limit, total, totalPages },
  });
  return withSecurityHeaders(response);
}
/**
 * POST /api/admin/players/bulk
 * Bulk lock/unlock for 1-100 players. Iteration 8: routed through
 * db/serverGameState.ts#setPlayerLockStateBulk.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders, clearAdminCache } from "@/lib/auth/admin";
import { setPlayerLockStateBulk } from "@/lib/db/serverGameState";
import { logAdminAction } from "@/lib/auth/admin-helpers";

export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const body = await request.json();
  const { userIds, action } = body;

  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 100) {
    return NextResponse.json({ error: "userIds must be an array of 1-100 UUIDs" }, { status: 400 });
  }
  if (action !== "lock" && action !== "unlock") {
    return NextResponse.json({ error: "action must be 'lock' or 'unlock'" }, { status: 400 });
  }

  const isLocked = action === "lock";
  const safeUserIds = userIds.filter((id: string) => id !== authResult.admin.id);
  const { successCount, failCount } = await setPlayerLockStateBulk(
    safeUserIds,
    isLocked,
    "Bulk admin action",
  );

  for (const userId of safeUserIds) {
    await logAdminAction({
      adminId: authResult.admin.id,
      actionType: isLocked ? "lock_account" : "unlock_account",
      targetUserId: userId,
      details: { bulk: true, batch_count: userIds.length },
    });
  }

  clearAdminCache();

  const response = NextResponse.json({
    success: true,
    action,
    successCount,
    failCount,
    total: userIds.length,
  });
  return withSecurityHeaders(response);
}
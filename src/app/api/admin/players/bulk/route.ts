import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders, clearAdminCache } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/auth/admin-helpers";

export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await request.json();
    const { userIds, action } = body;

    if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 100) {
      return NextResponse.json({ error: "userIds must be an array of 1-100 UUIDs" }, { status: 400 });
    }

    if (action !== "lock" && action !== "unlock") {
      return NextResponse.json({ error: "action must be 'lock' or 'unlock'" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const isLocked = action === "lock";
    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      if (userId === authResult.admin.id) continue;

      const { error } = await supabase
        .from("server_game_state")
        .update({ is_locked: isLocked, lock_reason: isLocked ? "Bulk admin action" : null })
        .eq("user_id", userId);

      if (!error) {
        successCount++;
        await logAdminAction({
          adminId: authResult.admin.id,
          actionType: isLocked ? "lock_account" : "unlock_account",
          targetUserId: userId,
          details: { bulk: true, batch_count: userIds.length },
        });
      } else {
        failCount++;
      }
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
  } catch (err) {
    console.error("[Admin/Players] Bulk action error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdminRole, canWrite, logAdminAction } from "@/lib/auth/admin-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/players/[id]/lock
 * Lock or unlock a player account.
 * Body: { locked: boolean, reason?: string }
 * Viewers cannot lock/unlock. Admins cannot lock themselves.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id: playerId } = await context.params;

  // Verify admin is not a viewer
  const role = await getAdminRole(authResult.admin);
  if (!canWrite(role)) {
    return NextResponse.json(
      { error: "Forbidden", message: "Viewers cannot lock/unlock accounts" },
      { status: 403 }
    );
  }

  // Admin cannot lock themselves
  if (authResult.admin.id === playerId) {
    return NextResponse.json(
      { error: "Forbidden", message: "Cannot lock/unlock your own account" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { locked, reason } = body;

    if (typeof locked !== "boolean") {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: "locked must be a boolean value",
        },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Check that the player exists
    const { data: existingPlayer, error: fetchError } = await supabase
      .from("server_game_state")
      .select("user_id, is_locked")
      .eq("user_id", playerId)
      .single();

    if (fetchError || !existingPlayer) {
      return NextResponse.json(
        { error: "Not Found", message: "Player not found" },
        { status: 404 }
      );
    }

    // Prepare update payload
    const updateData: Record<string, unknown> = {
      is_locked: locked,
      lock_reason: locked ? (reason || null) : null,
    };

    const { data, error } = await supabase
      .from("server_game_state")
      .update(updateData)
      .eq("user_id", playerId)
      .select()
      .single();

    if (error) {
      console.error(
        "[Admin/Players/Lock] Error updating lock status:",
        error.message
      );
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    // Log the admin action
    await logAdminAction({
      adminId: authResult.admin.id,
      actionType: locked ? "lock_account" : "unlock_account",
      targetUserId: playerId,
      details: {
        locked,
        reason: locked ? reason : undefined,
        previous_state: existingPlayer.is_locked,
      },
    });

    const response = NextResponse.json({
      success: true,
      message: `Account ${locked ? "locked" : "unlocked"} successfully`,
      data: {
        user_id: data.user_id,
        is_locked: data.is_locked,
        lock_reason: data.lock_reason,
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Players/Lock] Error locking/unlocking account:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update lock status" },
      { status: 500 }
    );
  }
}

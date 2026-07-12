import { NextResponse } from "next/server";
import type { AdminUser } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface LockAccountBody {
  locked?: unknown;
  reason?: unknown;
}

export async function handlePlayerLockAction(
  admin: AdminUser,
  playerId: string,
  body: unknown,
): Promise<NextResponse> {
  const parsed = parseLockBody(body);
  if (!parsed.ok) return parsed.response;

  const { locked, reason } = parsed.data;
  if (admin.id === playerId && locked) {
    return NextResponse.json(
      { error: "Forbidden", message: "Cannot lock your own account" },
      { status: 403 },
    );
  }

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service temporarily unavailable - database not configured" },
        { status: 503 },
      );
    }

    const { data: existingPlayer, error: fetchError } = await supabase
      .from("server_game_state")
      .select("user_id, is_locked")
      .eq("user_id", playerId)
      .single();

    if (fetchError || !existingPlayer) {
      return NextResponse.json(
        { error: "Not Found", message: "Player not found" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {
      is_locked: locked,
      lock_reason: locked ? reason || null : null,
      ...(locked ? {} : { cheat_flag_count: 0 }),
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
        error.message,
      );
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: admin.id,
      actionType: locked ? "lock_account" : "unlock_account",
      targetUserId: playerId,
      details: {
        locked,
        reason: locked ? reason : undefined,
        previous_state: existingPlayer.is_locked,
        self_unlock: admin.id === playerId && !locked,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Account ${locked ? "locked" : "unlocked"} successfully${!locked ? " - cheat flags reset" : ""}`,
      data: {
        user_id: data.user_id,
        is_locked: data.is_locked,
        lock_reason: data.lock_reason,
        cheat_flag_count: data.cheat_flag_count,
      },
    });
  } catch (err) {
    console.error("[Admin/Players/Lock] Error locking/unlocking account:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update lock status" },
      { status: 500 },
    );
  }
}

function parseLockBody(body: unknown):
  | { ok: true; data: { locked: boolean; reason?: string } }
  | { ok: false; response: NextResponse } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation Error", message: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }

  const { locked, reason } = body as LockAccountBody;
  if (typeof locked !== "boolean") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation Error", message: "locked must be a boolean value" },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    data: {
      locked,
      ...(typeof reason === "string" ? { reason } : {}),
    },
  };
}

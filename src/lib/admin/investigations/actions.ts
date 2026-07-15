import { NextResponse } from "next/server";
import type { AdminUser } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import { createServiceRoleClient } from '@/lib/db/access';;
import { computeMaxPossibleMoney } from "@/lib/game/server-time/serverTickValidator";
import type { ServerGameData } from "@/lib/game/shared/types/types";
import { loadInvestigationFullConfig } from "./configLoader";

interface ResetMoneyBody {
  action: "reset-money";
  userId: string;
}

interface LockAccountBody {
  action: "lock-account";
  userId: string;
  reason: string;
}

export type InvestigationActionBody = ResetMoneyBody | LockAccountBody;

function isInvestigationActionBody(
  body: unknown,
): body is InvestigationActionBody {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return (
    typeof record.action === "string" &&
    typeof record.userId === "string" &&
    (record.action === "reset-money" || record.action === "lock-account")
  );
}

export function handleInvestigationAction(
  admin: AdminUser,
  body: unknown,
): NextResponse | Promise<NextResponse> {
  if (!isInvestigationActionBody(body)) {
    return NextResponse.json(
      { error: "Missing required fields: action, userId" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  if (body.action === "reset-money") {
    return resetMoney(admin, body.userId);
  }

  return lockAccount(admin, body);
}

async function resetMoney(
  admin: AdminUser,
  userId: string,
): Promise<NextResponse> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  try {
    const { data: serverState, error: stateError } = await supabase
      .from("server_game_state")
      .select("money, full_state, game_tick")
      .eq("user_id", userId)
      .single();

    if (stateError || !serverState) {
      return NextResponse.json(
        {
          error: "No server game state found for this user",
          code: "NO_SERVER_STATE",
        },
        { status: 404 },
      );
    }

    const config = await loadInvestigationFullConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Game config unavailable - cannot compute max money" },
        { status: 503 },
      );
    }

    const gameState = serverState.full_state as ServerGameData;
    const currentMoney = gameState.money;
    const elapsedTicks =
      typeof serverState.game_tick === "number"
        ? serverState.game_tick
        : gameState.gameTick || 0;
    const maxMoney = computeMaxPossibleMoney(gameState, elapsedTicks, config);
    const resetMoneyValue =
      currentMoney > maxMoney ? maxMoney : currentMoney;
    const updatedFullState = {
      ...gameState,
      money: resetMoneyValue,
    };

    const { error: updateError } = await supabase
      .from("server_game_state")
      .update({
        money: resetMoneyValue,
        full_state: updatedFullState,
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error(
        "[Admin/Investigations] Failed to update server_game_state:",
        updateError.message,
      );
      return NextResponse.json(
        {
          error: "Failed to update game state",
          message: updateError.message,
        },
        { status: 500 },
      );
    }

    const { error: logError } = await supabase.from("player_actions").insert({
      user_id: userId,
      action_type: "admin_money_reset",
      payload: {
        previous_money: currentMoney,
        reset_money: resetMoneyValue,
        max_possible_money: maxMoney,
        was_over_max: currentMoney > maxMoney,
        admin_id: admin.id,
        admin_email: admin.email,
      },
      game_tick: gameState.gameTick || 0,
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error(
        "[Admin/Investigations] Failed to log admin_money_reset:",
        logError.message,
      );
    }

    await logAdminAction({
      adminId: admin.id,
      actionType: "admin_money_reset",
      targetUserId: userId,
      details: {
        previous_money: currentMoney,
        reset_money: resetMoneyValue,
        max_possible_money: maxMoney,
        was_over_max: currentMoney > maxMoney,
      },
    });

    return NextResponse.json({
      success: true,
      action: "reset-money",
      userId,
      previousMoney: currentMoney,
      resetMoney: resetMoneyValue,
      maxPossibleMoney: maxMoney,
      wasOverMax: currentMoney > maxMoney,
    });
  } catch (err) {
    console.error("[Admin/Investigations] Error in reset-money:", err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Failed to reset money",
      },
      { status: 500 },
    );
  }
}

async function lockAccount(
  admin: AdminUser,
  body: LockAccountBody,
): Promise<NextResponse> {
  if (!body.reason || typeof body.reason !== "string") {
    return NextResponse.json(
      { error: "Missing required field: reason" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  try {
    const { error: rpcError } = await supabase.rpc("lock_cheater_account", {
      p_user_id: body.userId,
      p_reason: body.reason,
    });

    if (rpcError) {
      console.error(
        "[Admin/Investigations] Failed to lock account:",
        rpcError.message,
      );
      return NextResponse.json(
        {
          error: "Failed to lock account",
          message: rpcError.message,
        },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: admin.id,
      actionType: "lock_account",
      targetUserId: body.userId,
      details: { reason: body.reason },
    });

    return NextResponse.json({
      success: true,
      action: "lock-account",
      userId: body.userId,
      reason: body.reason,
    });
  } catch (err) {
    console.error("[Admin/Investigations] Error in lock-account:", err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Failed to lock account",
      },
      { status: 500 },
    );
  }
}

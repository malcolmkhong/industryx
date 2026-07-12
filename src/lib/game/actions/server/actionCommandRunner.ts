import { NextResponse } from "next/server";
import { logActionAsync } from "@/lib/auth/gameStateValidator";
import type { GameState } from "@/lib/game/shared/types/types";
import { dispatchAction } from "./handlers/actionHandlers";
import { loadActionContext } from "./shared/actionContext";
import {
  applyElapsedServerTime,
  persistCorrectedActionState,
} from "./shared/actionPersistence";
import { actionTimingHeaders } from "./shared/actionTiming";
import type { ActionType } from "./shared/actionTypes";

export async function runActionCommand(
  request: Request,
  forcedAction?: ActionType,
) {
  const startedAt = Date.now();
  const contextResult = await loadActionContext(request, forcedAction);
  if (!contextResult.ok) return contextResult.response;

  const { action, authUserId, config, payload, requestId, serverState } =
    contextResult.context;

  const elapsedResult = await applyElapsedServerTime(serverState, authUserId);
  if (!elapsedResult.ok) return elapsedResult.response;
  const { activeServerState } = elapsedResult;

  const gameState = (activeServerState.full_state ?? {}) as Partial<GameState>;
  const serverGameTick = Number(activeServerState.game_tick);
  const serverMoney = Number(activeServerState.money);
  const actionHistory: string[] = Array.isArray(
    (activeServerState.full_state as Record<string, unknown>)?._action_history,
  )
    ? ((activeServerState.full_state as Record<string, unknown>)
        ._action_history as string[])
    : [];

  if (requestId !== undefined && requestId !== null) {
    if (actionHistory.includes(requestId)) {
      return NextResponse.json(
        {
          valid: false,
          error: "Duplicate request — possible replay attack",
          code: "REPLAY_DETECTED",
        },
        { status: 409 },
      );
    }
  }

  const result = await dispatchAction({
    action,
    payload,
    gameState,
    config,
    serverState,
    userId: authUserId,
  });

  const persistResult = await persistCorrectedActionState({
    action,
    actionHistory,
    activeServerState,
    requestId,
    result,
    userId: authUserId,
  });
  if (!persistResult.ok) return persistResult.response;

  const { appliedCorrectedState, responseCorrectedState } = persistResult;
  const postActionMoney =
    typeof appliedCorrectedState?.money === "number"
      ? appliedCorrectedState.money
      : serverMoney;

  logActionAsync({
    userId: authUserId,
    actionType: action as
      | "build"
      | "sell"
      | "buy"
      | "research"
      | "upgrade"
      | "transport"
      | "save"
      | "load"
      | "tick"
      | "prestige"
      | "import"
      | "claim_quest"
      | "hire_worker"
      | "assign_worker"
      | "upgrade_worker"
      | "start_drone_mission"
      | "collect_drone"
      | "buy_market"
      | "sell_market"
      | "toggle_building"
      | "upgrade_storage"
      | "collect_payout"
      | "claim_daily_reward"
      | "fulfill_contract"
      | "set_game_speed"
      | "bulk_build"
      | "bulk_sell",
    payload: {
      ...payload,
      ...(appliedCorrectedState ? { applied: true } : {}),
    },
    gameTick: serverGameTick,
    moneyAfter: postActionMoney,
    isValid: result.valid,
    validationRisk: result.valid ? "none" : "high",
    rejectionReason: result.valid ? undefined : result.error,
  });

  const responseBody = responseCorrectedState
    ? { ...result, correctedState: responseCorrectedState }
    : result;
  return NextResponse.json(responseBody, {
    headers: actionTimingHeaders(startedAt),
  });
}

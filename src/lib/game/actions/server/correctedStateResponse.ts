import { NextResponse } from "next/server";
import { logActionAsync } from "@/lib/auth/gameStateValidator";
import { actionTimingHeaders } from "./shared/actionTiming";
import type { ActionResponse, ActionType } from "./shared/actionTypes";

export interface FinalizeActionResponseInput {
  result: ActionResponse;
  appliedCorrectedState?: Partial<ActionResponse["correctedState"]> | null;
  responseCorrectedState: unknown;
  serverGameTick: number;
  serverMoney: number;
  action: ActionType;
  payload: Record<string, unknown>;
  authUserId: string;
  startedAt: number;
}

/**
 * Wrap up an action command: audit-log the attempt and shape the response.
 *
 * Extracted from `runActionCommand` so the dispatcher stays focused on
 * pipeline orchestration (context → elapsed → dispatch → persist) and
 * the finalization block (audit + response body) lives here.
 */
export function finalizeActionResponse(
  input: FinalizeActionResponseInput,
): NextResponse {
  const {
    result,
    appliedCorrectedState,
    responseCorrectedState,
    serverGameTick,
    serverMoney,
    action,
    payload,
    authUserId,
    startedAt,
  } = input;

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
      | "set_game_speed",
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
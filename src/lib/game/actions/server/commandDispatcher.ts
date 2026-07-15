import { NextResponse } from "next/server";
import type { GameState } from "@/lib/game/shared/types/types";
import { dispatchAction } from "./handlers/actionHandlers";
import { finalizeActionResponse } from "./correctedStateResponse";
import { persistCorrectedActionState } from "./shared/correctedStatePersistence";
import { applyElapsedServerTime } from "./shared/elapsedTickPersistence";
import { loadActionContext } from "./shared/loadActionContext";
import type { ActionType } from "./shared/actionTypes";

/**
 * Top-level command dispatcher for `/api/game/actions/*` routes.
 *
 * Pipeline:
 * 1. Load auth + payload + server state (`loadActionContext`)
 * 2. Apply any elapsed tick time since the last server snapshot
 * 3. Reject duplicate requestIds (replay-attack guard)
 * 4. Dispatch the action (handlers do server-side validation)
 * 5. Persist corrected state and produce public corrected state
 * 6. Hand off to `finalizeActionResponse` for audit + response shape
 */
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

  return finalizeActionResponse({
    result,
    appliedCorrectedState,
    responseCorrectedState,
    serverGameTick,
    serverMoney,
    action,
    payload,
    authUserId,
    startedAt,
  });
}

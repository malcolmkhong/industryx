import { NextResponse } from "next/server";
import {
  saveServerGameStateOptimistic,
  type ServerGameStateForAction,
} from "@/lib/db/game/serverGameState";
import { asFullState, stripUIFields } from "@/lib/db/game/serverGameStatePayload";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse, ActionType } from "./actionTypes";
import { buildDenormalizedStatePatchFields } from "./denormalizedStatePatch";
import type { PersistResult } from "./persistenceTypes";

interface PersistCorrectedStateInput {
  action: ActionType;
  actionHistory: string[];
  activeServerState: ServerGameStateForAction;
  requestId?: string;
  result: ActionResponse;
  userId: string;
}

export async function persistCorrectedActionState({
  action,
  actionHistory,
  activeServerState,
  requestId,
  result,
  userId,
}: PersistCorrectedStateInput): Promise<
  PersistResult<{
    appliedCorrectedState?: Partial<GameState>;
    responseCorrectedState?: Partial<GameState>;
  }>
> {
  const needPersist =
    result.valid &&
    Boolean(
      result.correctedState || (requestId !== undefined && requestId !== null),
    ) &&
    action !== "set_game_speed";
  if (!needPersist) {
    return { ok: true };
  }

  const appliedCorrectedState = result.correctedState;
  const historyAppend =
    requestId !== undefined && requestId !== null
      ? [...actionHistory, requestId].slice(-100)
      : actionHistory;
  const mergedFullState = {
    ...(activeServerState.full_state as Record<string, unknown>),
    ...(appliedCorrectedState ?? {}),
    ...(historyAppend !== actionHistory ? { _action_history: historyAppend } : {}),
  } as Record<string, unknown>;
  const publicCorrectedState = { ...mergedFullState };
  delete publicCorrectedState._action_history;
  const responseCorrectedState = publicCorrectedState as Partial<GameState>;
  const currentVersion = Number(activeServerState.state_version);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    console.error(
      "[ActionAPI] Invalid state_version for correctedState persist:",
      activeServerState.state_version,
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "Invalid server state version",
          code: "INVALID_STATE_VERSION",
        } satisfies ActionResponse,
        { status: 503 },
      ),
    };
  }

  const denormalizedFields = buildDenormalizedStatePatchFields(
    mergedFullState,
    activeServerState,
  );

  const persisted = await saveServerGameStateOptimistic(userId, currentVersion, {
    // C-003 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
    // Defense-in-depth — strip UI keys before coercing to full_state.
    full_state: asFullState(
      stripUIFields(mergedFullState as unknown as Record<string, unknown>),
    ),
    ...denormalizedFields,
    state_version: currentVersion + 1,
  }).catch((err) => {
    console.error("[ActionAPI] Failed to persist correctedState:", err);
    return null;
  });
  if (!persisted) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "Server failed to apply action — retry",
          code: "PERSIST_FAILED",
        } satisfies ActionResponse,
        { status: 503 },
      ),
    };
  }

  return { ok: true, appliedCorrectedState, responseCorrectedState };
}

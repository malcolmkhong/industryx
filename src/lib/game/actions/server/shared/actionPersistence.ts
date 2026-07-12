import { NextResponse } from "next/server";
import { applyElapsedTicks } from "@/lib/auth/applyElapsedTicks";
import { extractValidatedSaveFields } from "@/lib/auth/gameStateValidator";
import {
  saveServerGameStateOptimistic,
  type ServerGameStateForAction,
} from "@/lib/db/serverGameState";
import { asFullState } from "@/lib/db/serverGameStatePayload";
import type { GameState, ServerGameData } from "@/lib/game/shared/types/types";
import type { ActionResponse, ActionType } from "./actionTypes";

type PersistResult<T> = ({ ok: true } & T) | { ok: false; response: Response };

export async function applyElapsedServerTime(
  serverState: ServerGameStateForAction,
  userId: string,
): Promise<PersistResult<{ activeServerState: ServerGameStateForAction }>> {
  try {
    const rawGameSpeed = Number(serverState.game_speed);
    const allowedSpeeds = [1, 2, 5, 10] as const;
    if (!allowedSpeeds.includes(rawGameSpeed as 1 | 2 | 5 | 10)) {
      console.error(
        "[ActionAPI] Invalid game_speed in server state:",
        serverState.game_speed,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Invalid game speed in state",
            code: "INVALID_GAME_SPEED",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    const elapsed = await applyElapsedTicks(
      (serverState.full_state as unknown as ServerGameData) ??
        ({} as ServerGameData),
      serverState.last_tick_at ?? null,
      rawGameSpeed,
    );
    if (elapsed.elapsedTicks <= 0) {
      return { ok: true, activeServerState: serverState };
    }

    let elapsedFields;
    try {
      elapsedFields = extractValidatedSaveFields(
        elapsed.state as unknown as Record<string, unknown>,
      );
    } catch (err) {
      console.error("[ActionAPI] elapsed.state field validation failed:", err);
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Server tick state invalid — retry",
            code: "ELAPSED_TICK_INVALID",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    const elapsedStateVersion = Number(serverState.state_version);
    if (!Number.isInteger(elapsedStateVersion) || elapsedStateVersion < 0) {
      console.error(
        "[ActionAPI] Invalid state_version for elapsed-tick persist:",
        serverState.state_version,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Server tick state invalid — retry",
            code: "INVALID_STATE_VERSION",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    const persisted = await saveServerGameStateOptimistic(
      userId,
      elapsedStateVersion,
      {
        full_state: asFullState(elapsed.state),
        money: elapsedFields.money,
        total_money_earned: elapsedFields.totalMoneyEarned,
        game_tick: elapsedFields.gameTick,
        buildings_count: elapsedFields.buildingsCount,
        state_version: elapsedStateVersion + 1,
        last_tick_at: elapsed.serverNow,
        last_saved_at: elapsed.serverNow,
      },
    ).catch((err) => {
      console.error("[ActionAPI] Failed to persist elapsed-tick state:", err);
      return null;
    });
    if (!persisted) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            valid: false,
            error: "Server failed to apply elapsed ticks — retry",
            code: "ELAPSED_TICK_PERSIST_FAILED",
          } satisfies ActionResponse,
          { status: 503 },
        ),
      };
    }

    return { ok: true, activeServerState: persisted as ServerGameStateForAction };
  } catch (err) {
    console.error("[ActionAPI] applyElapsedTicks failed:", err);
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "Server tick computation unavailable — retry",
          code: "ELAPSED_TICK_FAILED",
        } satisfies ActionResponse,
        { status: 503 },
      ),
    };
  }
}

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
  const persistedBuildings = (appliedCorrectedState as { buildings?: unknown })
    ?.buildings;
  const persistedBuildingsCount = Array.isArray(persistedBuildings)
    ? persistedBuildings.length
    : activeServerState.buildings_count;
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

  const persisted = await saveServerGameStateOptimistic(userId, currentVersion, {
    full_state: asFullState(mergedFullState),
    money:
      typeof appliedCorrectedState?.money === "number"
        ? appliedCorrectedState.money
        : Number(activeServerState.money),
    game_tick:
      typeof responseCorrectedState.gameTick === "number"
        ? responseCorrectedState.gameTick
        : Number(activeServerState.game_tick),
    buildings_count: persistedBuildingsCount,
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

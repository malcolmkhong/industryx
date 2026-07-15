import { NextResponse } from "next/server";
import {
  isServerGameStateAvailable,
  loadServerGameStateForAction,
  type ServerGameStateForAction,
} from "@/lib/db/game/serverGameState";
import type { GameConfig } from "@/lib/game/config/config";
import type { ActionResponse, ActionType } from "./actionTypes";
import { authorizeActionContext } from "./contextAuth";
import { parseAndValidateActionBody } from "./contextRequest";
import { loadConfig } from "./loadConfig";

export interface ActionContext {
  action: ActionType;
  authUserId: string;
  config: GameConfig;
  payload: Record<string, unknown>;
  requestId?: string;
  serverState: ServerGameStateForAction;
}

export type ActionContextResult =
  | { ok: true; context: ActionContext }
  | { ok: false; response: Response };

function serviceUnavailable(error: string, code?: string): Response {
  return NextResponse.json(
    code
      ? ({ valid: false, error, code } satisfies ActionResponse)
      : ({ valid: false, error } satisfies ActionResponse),
    { status: 503 },
  );
}

/**
 * Build the full `ActionContext` for a request.
 *
 * Pipeline (any failure short-circuits with a Response):
 *  1. Parse + validate JSON body (user id, action, payload)
 *  2. Resolve auth session or active guest device binding + rate limit
 *  3. Load game config (503 if unavailable)
 *  4. Check server-state availability + load it (404 if missing)
 */
export async function loadActionContext(
  request: Request,
  forcedAction?: ActionType,
): Promise<ActionContextResult> {
  const bodyResult = await parseAndValidateActionBody(
    request,
    forcedAction,
  );
  if (!bodyResult.ok) return { ok: false, response: bodyResult.response };

  const authResult = await authorizeActionContext(
    bodyResult.body.userId,
    bodyResult.body.deviceId,
    forcedAction,
  );
  if (!authResult.ok) return { ok: false, response: authResult.response };

  const config = await loadConfig();
  if (!config) {
    return {
      ok: false,
      response: serviceUnavailable(
        "Game config unavailable — cannot validate action",
      ),
    };
  }

  if (!isServerGameStateAvailable()) {
    return {
      ok: false,
      response: serviceUnavailable("Server unavailable"),
    };
  }

  const serverState = await loadServerGameStateForAction(authResult.auth.userId);
  if (!serverState) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error:
            "No authoritative server state found — initialize session first via /api/auth/initialize-guest or save via /api/game/state/sync",
          code: "NO_SERVER_STATE",
        } satisfies ActionResponse,
        { status: 404 },
      ),
    };
  }

  return {
    ok: true,
    context: {
      action: bodyResult.body.action,
      authUserId: authResult.auth.userId,
      config,
      payload: bodyResult.body.payload,
      requestId: bodyResult.body.requestId,
      serverState,
    },
  };
}

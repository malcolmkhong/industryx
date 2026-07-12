import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import {
  isServerGameStateAvailable,
  loadServerGameStateForAction,
  type ServerGameStateForAction,
} from "@/lib/db/serverGameState";
import type { GameConfig } from "@/lib/game/config/config";
import { loadConfig } from "./actionConfig";
import {
  ACTION_ROUTE_PATHS,
  VALID_ACTIONS,
  type ActionRequest,
  type ActionResponse,
  type ActionType,
} from "./actionTypes";

export interface ActionContext {
  action: ActionType;
  authUserId: string;
  config: GameConfig;
  payload: Record<string, unknown>;
  requestId?: string;
  serverState: ServerGameStateForAction;
}

type ActionContextResult =
  | { ok: true; context: ActionContext }
  | { ok: false; response: Response };

export async function loadActionContext(
  request: Request,
  forcedAction?: ActionType,
): Promise<ActionContextResult> {
  const auth = await verifyAuth();
  if (!auth.success) return { ok: false, response: auth.response };

  const rateLimitResponse = await checkRateLimit(
    auth.userId,
    RATE_LIMITS.action,
    forcedAction ? ACTION_ROUTE_PATHS[forcedAction] : "/api/game/actions/legacy",
  );
  if (rateLimitResponse) {
    return { ok: false, response: rateLimitResponse };
  }

  let body: ActionRequest;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { valid: false, error: "Invalid JSON body" } satisfies ActionResponse,
        { status: 400 },
      ),
    };
  }

  const { userId, requestId, action: legacyAction, actionType, payload } = body;
  const action = forcedAction ?? legacyAction ?? actionType;

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "userId is required in request body",
        } satisfies ActionResponse,
        { status: 400 },
      ),
    };
  }

  if (userId !== auth.userId) {
    console.warn(
      `[ActionAPI] User ${auth.userId} attempted action for ${userId}`,
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "You can only perform actions for your own game",
          code: "FORBIDDEN_OWNERSHIP",
        } satisfies ActionResponse,
        { status: 403 },
      ),
    };
  }

  if (!action || !VALID_ACTIONS.includes(action as ActionType)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(", ")}`,
        } satisfies ActionResponse,
        { status: 400 },
      ),
    };
  }
  const validatedAction = action as ActionType;

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "Missing or invalid payload",
        } satisfies ActionResponse,
        { status: 400 },
      ),
    };
  }

  const config = await loadConfig();
  if (!config) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "Game config unavailable — cannot validate action",
        } satisfies ActionResponse,
        { status: 503 },
      ),
    };
  }

  if (!isServerGameStateAvailable()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          valid: false,
          error: "Server unavailable",
        } satisfies ActionResponse,
        { status: 503 },
      ),
    };
  }

  const serverState = await loadServerGameStateForAction(auth.userId);
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
      action: validatedAction,
      authUserId: auth.userId,
      config,
      payload,
      requestId,
      serverState,
    },
  };
}

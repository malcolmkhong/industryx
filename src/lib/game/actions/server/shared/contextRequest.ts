import { NextResponse } from "next/server";
import {
  VALID_ACTIONS,
  type ActionRequest,
  type ActionResponse,
  type ActionType,
} from "./actionTypes";

export interface ParsedActionBody {
  userId: string;
  deviceId: string | null;
  requestId?: string;
  payload: Record<string, unknown>;
  action: ActionType;
}

export type ParseRequestResult =
  | { ok: true; body: ParsedActionBody }
  | { ok: false; response: Response };

function badRequest(error: string): Response {
  return NextResponse.json(
    { valid: false, error } satisfies ActionResponse,
    { status: 400 },
  );
}

/**
 * Parse the JSON body of an action request and run the trust-bearing
 * checks that depend only on the body: user id presence + ownership,
 * action whitelisting, payload shape.
 *
 * Server-state availability is checked separately by the orchestrator
 * after auth + config have loaded.
 */
export async function parseAndValidateActionBody(
  request: Request,
  forcedAction?: ActionType,
): Promise<ParseRequestResult> {
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

  const {
    userId,
    deviceId,
    requestId,
    action: legacyAction,
    actionType,
    payload,
  } = body;
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
      response: badRequest("Missing or invalid payload"),
    };
  }

  return {
    ok: true,
    body: {
      userId,
      deviceId: typeof deviceId === "string" ? deviceId.trim() : null,
      requestId,
      payload,
      action: validatedAction,
    },
  };
}

import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { verifyAuth, type AuthResult } from "@/lib/auth/verifyAuth";
import {
  callBootstrapGuest,
  rowErrorCode,
} from "@/lib/db/auth/bootstrapRpcs.server";
import { ACTION_ROUTE_PATHS, type ActionType } from "./actionTypes";

export interface ContextAuthSuccess {
  ok: true;
  auth: AuthResult;
}

export interface ContextAuthFailure {
  ok: false;
  response: Response;
}

export type ContextAuthResult = ContextAuthSuccess | ContextAuthFailure;

/**
 * Run the two pre-load trust checks: verify the session and apply the
 * per-action rate limit. `forcedAction` lets callers (e.g. dedicated
 * routes) report the rate-limit bucket correctly; the legacy route
 * falls back to the shared bucket.
 */
export async function authorizeActionContext(
  requestUserId: string,
  deviceId: string | null,
  forcedAction?: ActionType,
): Promise<ContextAuthResult> {
  const auth = await verifyAuth();
  let resolvedAuth: AuthResult | null;
  let authFailureResponse: Response | null = null;
  if (auth.success) {
    resolvedAuth = auth;
  } else {
    authFailureResponse = auth.response;
    resolvedAuth = await resolveGuestAuth(requestUserId, deviceId);
  }
  if (!resolvedAuth) {
    return {
      ok: false,
      response: authFailureResponse ?? new Response(null, { status: 401 }),
    };
  }

  if (resolvedAuth.userId !== requestUserId) {
    console.warn(
      `[ActionAPI] User ${resolvedAuth.userId} attempted action for ${requestUserId}`,
    );
    return {
      ok: false,
      response: Response.json(
        {
          valid: false,
          error: "You can only perform actions for your own game",
          code: "FORBIDDEN_OWNERSHIP",
        },
        { status: 403 },
      ),
    };
  }

  const rateLimitResponse = await checkRateLimit(
    auth.success ? resolvedAuth.userId : `guest:${deviceId ?? requestUserId}`,
    RATE_LIMITS.action,
    forcedAction ? ACTION_ROUTE_PATHS[forcedAction] : "/api/game/actions/legacy",
  );
  if (rateLimitResponse) {
    return { ok: false, response: rateLimitResponse };
  }

  return { ok: true, auth: resolvedAuth };
}

async function resolveGuestAuth(
  requestUserId: string,
  deviceId: string | null,
): Promise<AuthResult | null> {
  if (!deviceId) return null;

  const guest = await callBootstrapGuest({
    deviceId,
    fingerprintHash: null,
  });
  if (!guest.ok) return null;

  const row = guest.row;
  const err = rowErrorCode(row);
  if (err || row.status !== "OK" || !row.user_id) return null;
  if (row.user_id !== requestUserId) return null;

  return {
    success: true,
    userId: row.user_id,
  };
}

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import {
  callBootstrapGuest,
  rowErrorCode,
} from "@/lib/db/auth/bootstrapRpcs.server";
import {
  isServerGameStateAvailable,
  loadServerGameStateForAction,
} from "@/lib/db/game/serverGameState";
import { applyElapsedServerTime } from "@/lib/game/actions/server/shared/actionPersistence";
import { recordTickResponse } from "@/lib/game/production/observability";

interface LiveTickBody {
  deviceId?: unknown;
}

export async function POST(request: Request) {
  const auth = await verifyAuth(request as NextRequest);
  const body = (await request.json().catch(() => ({}))) as LiveTickBody;
  const deviceId =
    typeof body.deviceId === "string" ? body.deviceId.trim() : "";

  let identity: { userId: string; rateLimitId: string } | null;
  let authFailureResponse: Response | null = null;
  if (auth.success) {
    identity = { userId: auth.userId, rateLimitId: auth.userId };
  } else {
    authFailureResponse = auth.response;
    identity = await resolveGuestIdentity(deviceId);
  }

  if (!identity) return authFailureResponse ?? new Response(null, { status: 401 });

  const rateLimitResponse = await checkRateLimit(
    identity.rateLimitId,
    RATE_LIMITS.serverTick,
    "/api/game/state/live-tick",
  );
  if (rateLimitResponse) return rateLimitResponse;

  if (!isServerGameStateAvailable()) {
    return NextResponse.json(
      { error: "Server unavailable", code: "SERVER_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const serverState = await loadServerGameStateForAction(identity.userId);
  if (!serverState) {
    return NextResponse.json(
      {
        error: "No authoritative server state found",
        code: "NO_SERVER_STATE",
      },
      { status: 404 },
    );
  }

  if (serverState.is_locked) {
    return NextResponse.json(
      {
        error: serverState.lock_reason ?? "Account locked",
        code: "ACCOUNT_LOCKED",
      },
      { status: 403 },
    );
  }

  const elapsedResult = await applyElapsedServerTime(serverState, identity.userId);
  if (!elapsedResult.ok) return elapsedResult.response;

  const { activeServerState, elapsedTicks, productionSnapshot } = elapsedResult;
  const newState = activeServerState.full_state;
  if (!newState || typeof newState !== "object" || Array.isArray(newState)) {
    return NextResponse.json(
      { error: "Corrupt game state", code: "INVALID_FULL_STATE" },
      { status: 503 },
    );
  }

  // PR-BP-5 §7 (NEW-TEST-031 telemetry variant): track snapshot installation
  // rate at the response boundary. `productionSnapshot != null` means the
  // tick produced a usable snapshot for the UI; null means zero-tick or
  // cold-start (per audit §1.1 V-001). The admin telemetry endpoint reads
  // these counters to surface installation drift.
  recordTickResponse(productionSnapshot != null);

  return NextResponse.json({
    newState,
    ticksApplied: elapsedTicks,
    gameTick: Number(activeServerState.game_tick),
    productionSnapshot: elapsedResult.productionSnapshot,
  });
}

async function resolveGuestIdentity(
  deviceId: string,
): Promise<{ userId: string; rateLimitId: string } | null> {
  if (!deviceId) return null;

  const guest = await callBootstrapGuest({
    deviceId,
    fingerprintHash: null,
  });
  if (!guest.ok) return null;

  const row = guest.row;
  const err = rowErrorCode(row);
  if (err || !row.user_id) return null;
  // bootstrap_guest returns "OK_CREATED" or "OK_EXISTING" — accept either.
  if (row.status !== "OK_CREATED" && row.status !== "OK_EXISTING") return null;

  return {
    userId: row.user_id,
    rateLimitId: `guest:${deviceId}`,
  };
}

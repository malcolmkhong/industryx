import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import {
  isServerGameStateAvailable,
  loadServerGameStateForAction,
} from "@/lib/db/game/serverGameState";
import { applyElapsedServerTime } from "@/lib/game/actions/server/shared/actionPersistence";

export async function POST() {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const rateLimitResponse = await checkRateLimit(
    auth.userId,
    RATE_LIMITS.compute,
    "/api/game/state/live-tick",
  );
  if (rateLimitResponse) return rateLimitResponse;

  if (!isServerGameStateAvailable()) {
    return NextResponse.json(
      { error: "Server unavailable", code: "SERVER_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const serverState = await loadServerGameStateForAction(auth.userId);
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

  const elapsedResult = await applyElapsedServerTime(serverState, auth.userId);
  if (!elapsedResult.ok) return elapsedResult.response;

  const { activeServerState, elapsedTicks } = elapsedResult;
  const newState = activeServerState.full_state;
  if (!newState || typeof newState !== "object" || Array.isArray(newState)) {
    return NextResponse.json(
      { error: "Corrupt game state", code: "INVALID_FULL_STATE" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    newState,
    ticksApplied: elapsedTicks,
    gameTick: Number(activeServerState.game_tick),
  });
}

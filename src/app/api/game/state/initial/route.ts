// ============================================
// GET /api/game/state/initial
// Returns the server-authoritative canonical ServerGameData template.
// Client uses this to bootstrap the Zustand store on first mount so
// display state matches what `initializeGuestGameState` inserts on
// the server. UISessionState (activeTab, notifications, hydrated, ...)
// is added by the client on merge — NEVER included in this response.
//
// Phase 13 (2026-07-10) — paired with fetchCanonicalInitialState().
// Cache-Control mirrors /api/game/config/definitions.
// ============================================

import { NextResponse, type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { fetchCanonicalInitialState } from "@/lib/db/initialState.server";

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.success) return auth.response;

  const limited = await checkRateLimit(
    auth.userId,
    RATE_LIMITS.config,
    "/api/game/state/initial",
  );
  if (limited) return limited;

  try {
    const initialState = await fetchCanonicalInitialState();
    return NextResponse.json(
      { initialState, fetchedAt: Date.now() },
      {
        headers: {
          // Browser cache 60s, CDN edge 5min, SWR 1h.
          "Cache-Control":
            "private, max-age=60, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err) {
    console.error("[api/game/initial-state] failed:", err);
    return NextResponse.json(
      {
        error: "Initial state unavailable",
        code: "INITIAL_STATE_FAILED",
      },
      { status: 503 },
    );
  }
}

/**
 * POST /api/auth/guest/quickstart
 *
 * PR 4-4B: LEGACY compatibility wrapper. Kept mounted so existing callers
 * continue to compile and behave identically during the orchestrator migration.
 * The handler is now a thin facade that:
 *
 *   1. Validates its OWN legacy request shape (`{ deviceId, fingerprint }`).
 *   2. Computes `fingerprintHash` from `fingerprint` (sentinel -> null).
 *   3. POSTs the canonical body to `/api/auth/bootstrap` (delegated).
 *   4. Translates the bootstrap response back into the LEGACY
 *      `{ userId, source, isNewUser, initialState, limited }` shape.
 *
 * The canonical bootstrap service is the single source of truth for identity
 * resolution and binding (AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §4). When all
 * callers migrate to `/api/auth/bootstrap` directly, this wrapper is removed
 * per §18.
 */

import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  runBootstrap,
  type BootstrapResult,
} from "@/lib/auth/server/bootstrapService.server";
import {
  buildCompleteFullStateForServerRow,
  loadServerGameStateLite,
} from "@/lib/db/game/serverGameState";

// Sentinel sent by the client when the browser could not produce a fingerprint.
// Preserved verbatim so the wrapper contract stays bit-compatible with the
// pre-PR4 callers that still send it.
const FINGERPRINT_UNAVAILABLE_SENTINEL = "__fingerprint_unavailable__";

/**
 * Legacy source taxonomy. Bootstrap returns a superset
 * (`deviceId | auth | fresh | sign_out_to_guest`); the wrapper collapses the
 * non-guest variants back to the legacy three-way bucket so callers see no
 * shape change.
 */
type LegacySource = "deviceId" | "fingerprint" | "fresh";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: unknown;
      fingerprint?: unknown;
    };

    // ── 1. Validate legacy request shape ───────────────────────────────
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 },
      );
    }

    const fingerprintRaw =
      typeof body.fingerprint === "string" ? body.fingerprint : "";
    // Legacy literal "unknown" was rejected by the old route. Preserve.
    if (!fingerprintRaw || fingerprintRaw === "unknown") {
      return NextResponse.json(
        { error: 'fingerprint is required and must not be "unknown"' },
        { status: 400 },
      );
    }

    const fingerprintUnavailable =
      fingerprintRaw === FINGERPRINT_UNAVAILABLE_SENTINEL;
    const fingerprintHash = fingerprintUnavailable
      ? null
      : createHash("sha256").update(fingerprintRaw).digest("hex");

    // ── 2. Delegate to the canonical bootstrap service ────────────────
    const result = await runBootstrap({
      deviceId,
      fingerprintHash,
      // Quickstart is anonymous. Never set previousAuthUserId; the bootstrap
      // service treats its presence as an explicit sign-out intent (plan §6).
      previousAuthUserId: null,
    });

    if (result.kind !== "ready") {
      return mapBootstrapErrorToLegacy(result);
    }
    const ready = result.ready;

    // ── 3. Build the legacy initialState shape ────────────────────────
    const stateRow = await loadServerGameStateLite(ready.userId);
    if (!stateRow) {
      return NextResponse.json(
        { error: "state_load_failed" },
        { status: 500 },
      );
    }
    const initialState = await buildCompleteFullStateForServerRow(stateRow);

    // ── 4. Translate to legacy response shape ─────────────────────────
    const legacySource = mapBootstrapSourceToLegacy(ready.source);

    return NextResponse.json(
      {
        userId: ready.userId,
        source: legacySource,
        isNewUser: ready.isNewUser,
        initialState,
        // Legacy definition of "limited": client had no fingerprint AND the
        // resolved identity is a fresh one (no prior binding to recover into).
        limited: fingerprintUnavailable && legacySource === "fresh",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[quickstart] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function mapBootstrapSourceToLegacy(source: string): LegacySource {
  // Bootstrap may return `auth` or `sign_out_to_guest` on authenticated /
  // sign-out flows. Quickstart is a no-session endpoint, so neither should
  // appear in practice; collapse defensively to the closest legacy bucket.
  switch (source) {
    case "deviceId":
      return "deviceId";
    case "fresh":
      return "fresh";
    default:
      // `auth` / `sign_out_to_guest` / anything new: callers that still hit
      // this endpoint will see `deviceId` and log a warning. Better than a
      // silent shape change.
      return "deviceId";
  }
}

function mapBootstrapErrorToLegacy(result: BootstrapResult): NextResponse {
  switch (result.kind) {
    case "invalid_request":
      return NextResponse.json(
        { error: result.reason },
        { status: 400 },
      );
    case "conflict":
      // Legacy had no conflict path; collapse to a generic 500-equivalent.
      return NextResponse.json(
        { error: "account_creation_failed" },
        { status: 500 },
      );
    case "recovery_required":
      // Legacy never surfaced 422. Closest semantic match is a state failure.
      return NextResponse.json(
        { error: "state_load_failed" },
        { status: 500 },
      );
    case "unavailable":
      if (result.reason === "rate_limited") {
        return NextResponse.json(
          { error: "rate_limited" },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 },
      );
    case "internal_error":
    default:
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
  }
}
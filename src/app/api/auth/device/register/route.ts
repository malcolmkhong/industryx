/**
 * POST /api/auth/device/register
 *
 * PR 4-4B: LEGACY compatibility wrapper. Kept mounted so existing callers
 * continue to compile and behave identically during the orchestrator migration.
 * The handler is now a thin facade that:
 *
 *   1. Validates its OWN legacy request shape (`{ deviceId, fingerprint?,
 *      fingerprintHash? }`).
 *   2. Verifies the caller has an authenticated, email-based session.
 *   3. Computes the fingerprint hash if only the raw fingerprint was supplied.
 *   4. Delegates to the canonical `/api/auth/bootstrap` service with the
 *      current auth session so device binding + identity resolution are owned
 *      by the bootstrap path. previousAuthUserId is OMITTED — this endpoint is
 *      the regular authenticated bind flow, not the sign-out-to-guest path
 *      (plan §6).
 *   5. Translates the bootstrap response back into the LEGACY
 *      `{ ok, alreadyExists, reason? }` shape.
 *
 * The canonical bootstrap service is the single source of truth for device
 * binding (AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §6). When all callers migrate
 * to `/api/auth/bootstrap` directly, this wrapper is removed per §18.
 */

import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { verifyAuth } from "@/lib/auth/verifyAuth";
import {
  runBootstrap,
  type BootstrapResult,
} from "@/lib/auth/server/bootstrapService.server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: unknown;
      fingerprint?: unknown;
      fingerprintHash?: unknown;
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

    const fingerprint =
      typeof body.fingerprint === "string" && body.fingerprint.length > 0
        ? body.fingerprint
        : null;
    const fingerprintHashRaw =
      typeof body.fingerprintHash === "string" && body.fingerprintHash.length > 0
        ? body.fingerprintHash
        : null;
    const computedHash = fingerprintHashRaw
      ? fingerprintHashRaw
      : fingerprint
        ? createHash("sha256").update(fingerprint).digest("hex")
        : null;

    // ── 2. Verify auth (legacy contract: requires authenticated,
    //       non-anonymous session) ─────────────────────────────────────
    const auth = await verifyAuth(request);
    if (!auth.success) return auth.response;
    if (auth.email === undefined) {
      return NextResponse.json(
        { error: "Email-based authentication required" },
        { status: 403 },
      );
    }

    // ── 3. Delegate to the canonical bootstrap service ────────────────
    // Omit previousAuthUserId: this is the regular authenticated bind flow,
    // not the sign-out-to-guest path (plan §6). The bootstrap service will
    // bind the device and evaluate guest-upgrade eligibility.
    const result = await runBootstrap({
      deviceId,
      fingerprintHash: computedHash,
      previousAuthUserId: null,
    });

    if (result.kind !== "ready") {
      return mapBootstrapErrorToLegacy(result);
    }
    const ready = result.ready;

    // Bootstrap may load authenticated state where the binding already exists
    // (returning user on a known device) or where it was just created (first
    // login on this device). isNewBinding maps directly to alreadyExists.
    return NextResponse.json(
      {
        ok: true,
        alreadyExists: !ready.isNewUser,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[RegisterDevice] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

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
        { error: "identity_insert_failed" },
        { status: 500 },
      );
    case "recovery_required":
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
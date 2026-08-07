/**
 * POST /api/auth/bootstrap
 *
 * SINGLE entry point for all bootstrap flows per
 * AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §4 step 7.
 *
 * Replaces the legacy split between /api/auth/guest/quickstart,
 * /api/auth/device/register, /api/auth/identity/link, /api/auth/identity/confirm-link.
 * Those endpoints remain (PR 4) as thin wrappers that delegate here so existing
 * callers continue to compile during the migration.
 *
 * Request body:
 *   {
 *     deviceId: string,                // required
 *     fingerprintHash?: string,        // optional, telemetry only
 *     previousAuthUserId?: string      // set on intentional sign-out (plan §6)
 *   }
 *
 * Response codes per plan §15:
 *   200 BOOTSTRAP_READY
 *   400 INVALID_BOOTSTRAP_REQUEST
 *   401 INVALID_SESSION
 *   409 ACCOUNT_PROGRESS_CONFLICT
 *   409 DEVICE_BOUND_TO_OTHER_USER
 *   422 STATE_RECOVERY_REQUIRED
 *   429 BOOTSTRAP_RATE_LIMITED
 *   503 BOOTSTRAP_UNAVAILABLE
 *   500 INTERNAL_BOOTSTRAP_ERROR
 *
 * SECURITY: rate-limited per deviceId. No auth required (handles both
 * authenticated and unauthenticated requests). The Supabase session (if any)
 * is read from the request cookie and verified server-side.
 */

import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { logRequestIp } from "@/app/api/auth/_shared/request-ip-log-helper";
import {
  runBootstrap,
  type BootstrapResult,
} from "@/lib/auth/server/bootstrapService.server";
import { type UpgradePolicy } from "@/lib/db/auth/bootstrapRpcs.server";

// ─── Public DTOs ────────────────────────────────────────────────────────

interface BootstrapRequestBody {
  deviceId?: unknown;
  fingerprintHash?: unknown;
  previousAuthUserId?: unknown;
  /**
   * Migration 079: per-request auth-merge policy. Server-side defaults
   * to 'auth_wins_archive_guest' if omitted. Forwarded to the upgrade RPC.
   */
  mergePolicy?: UpgradePolicy;
}

interface BootstrapResponseBody {
  code: string;
  message: string;
  retryable: boolean;
  userId?: string;
  isGuest?: boolean;
  isNewUser?: boolean;
  source?: string;
  hasGameState?: boolean;
  needsStateLoad?: boolean;
  gameState?: Record<string, unknown>;
  conflictReason?: string;
  survivingUserId?: string | null;
  archivedGuestId?: string | null;
  /** Migration 079: archive receipt id from the recoverable snapshot row. */
  archiveReceiptId?: string | null;
}

// ─── Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Hardened JSON parse. The old `.catch(() => ({}))` silently swallowed
    // JSON.parse errors which made every 500 look the same. Now we log
    // the actual error and return INVALID_BOOTSTRAP_REQUEST (400) for
    // empty bodies, and let malformed JSON surface as a 500 with a
    // visible server-side log line.
    let body: BootstrapRequestBody = {};
    try {
      const text = await request.text();
      if (text.length > 0) {
        body = JSON.parse(text) as BootstrapRequestBody;
      }
    } catch (parseErr) {
      console.warn(
        "[bootstrap] request body is not valid JSON, treating as empty:",
        (parseErr as Error).message,
      );
      body = {};
    }

    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    const fingerprintHash =
      typeof body.fingerprintHash === "string" &&
      body.fingerprintHash.length > 0
        ? body.fingerprintHash
        : null;
    const previousAuthUserId =
      typeof body.previousAuthUserId === "string" &&
      body.previousAuthUserId.length > 0
        ? body.previousAuthUserId
        : null;
    // Migration 079: client may forward its auth-merge policy preference.
    // The HTTP layer accepts either of the two valid policy values; anything
    // else falls through to the service-side default.
    const mergePolicy: UpgradePolicy | undefined =
      body.mergePolicy === "auth_wins_archive_guest" ||
      body.mergePolicy === "explicit_conflict"
        ? body.mergePolicy
        : undefined;

    // Best-effort rate limit by deviceId. Fail-open per plan §15.
    if (deviceId) {
      const limited = await checkRateLimit(
        deviceId,
        RATE_LIMITS.bootstrap,
        "/api/auth/bootstrap",
      );
      if (limited) return limited;
    }

    logRequestIp(request, "/api/auth/bootstrap", null);

    const result = await runBootstrap({
      deviceId,
      fingerprintHash,
      previousAuthUserId,
      ...(mergePolicy ? { mergePolicy } : {}),
    });

    return bootstrapResultToResponse(result);
  } catch (error) {
    // Capture the full stack + a structured fingerprint so the next
    // INTERNAL_BOOTSTRAP_ERROR is self-diagnosing. Before this log
    // was a single line which made it hard to tell whether the throw
    // was in request.json(), createServerSupabaseClient(), runBootstrap,
    // or anywhere else downstream.
    const err = error as Error & { cause?: unknown; code?: string };
    console.error(
      "[bootstrap] INTERNAL_BOOTSTRAP_ERROR",
      JSON.stringify({
        name: err?.name,
        message: err?.message,
        code: err?.code,
        cause: err?.cause ? String(err.cause) : undefined,
        stack: err?.stack,
      }),
    );
    return NextResponse.json(
      {
        code: "INTERNAL_BOOTSTRAP_ERROR",
        message: "Internal server error",
        retryable: false,
      } satisfies BootstrapResponseBody,
      { status: 500 },
    );
  }
}

// ─── Result -> HTTP response mapping (plan §15) ────────────────────────

function bootstrapResultToResponse(result: BootstrapResult): NextResponse {
  switch (result.kind) {
    case "ready": {
      const r = result.ready;
      return NextResponse.json(
        {
          code: "BOOTSTRAP_READY",
          message: "Bootstrap complete.",
          retryable: false,
          userId: r.userId,
          isGuest: r.isGuest,
          isNewUser: r.isNewUser,
          source: r.source,
          hasGameState: r.hasGameState,
          needsStateLoad: r.needsStateLoad,
          gameState: r.gameState as unknown as Record<string, unknown>,
          // Migration 079: surface archive metadata to the client so the
          // UI can render a one-time "previous progress was archived"
          // banner. Both fields are null when no archive happened.
          archiveReceiptId: r.archiveReceiptId ?? null,
          archivedGuestId: r.archivedGuestId ?? null,
        } satisfies BootstrapResponseBody,
        { status: 200 },
      );
    }
    case "conflict": {
      return NextResponse.json(
        {
          code: result.conflict.reason,
          message:
            result.conflict.reason === "ACCOUNT_PROGRESS_CONFLICT"
              ? "Account progress conflict requires resolution."
              : "Device is bound to another user.",
          retryable: false,
          conflictReason: result.conflict.reason,
          survivingUserId: result.conflict.survivingUserId,
          archivedGuestId: result.conflict.archivedGuestId,
        } satisfies BootstrapResponseBody,
        { status: 409 },
      );
    }
    case "recovery_required": {
      return NextResponse.json(
        {
          code: "STATE_RECOVERY_REQUIRED",
          message: "Saved state is corrupt or missing; recovery required.",
          retryable: false,
        } satisfies BootstrapResponseBody,
        { status: 422 },
      );
    }
    case "invalid_request": {
      return NextResponse.json(
        {
          code: "INVALID_BOOTSTRAP_REQUEST",
          message: result.reason,
          retryable: false,
        } satisfies BootstrapResponseBody,
        { status: 400 },
      );
    }
    case "unavailable": {
      const isRateLimit = result.reason === "rate_limited";
      return NextResponse.json(
        {
          code: isRateLimit
            ? "BOOTSTRAP_RATE_LIMITED"
            : "BOOTSTRAP_UNAVAILABLE",
          message: isRateLimit
            ? "Too many bootstrap requests."
            : "Bootstrap service is temporarily unavailable.",
          retryable: true,
        } satisfies BootstrapResponseBody,
        { status: isRateLimit ? 429 : 503 },
      );
    }
    case "internal_error": {
      return NextResponse.json(
        {
          code: "INTERNAL_BOOTSTRAP_ERROR",
          message: "Bootstrap failed. See server logs.",
          retryable: false,
        } satisfies BootstrapResponseBody,
        { status: 500 },
      );
    }
    default: {
      // Unreachable under TypeScript narrowing; defensive fallback so the
      // consistent-return ESLint rule is satisfied.
      return NextResponse.json(
        {
          code: "INTERNAL_BOOTSTRAP_ERROR",
          message: "Bootstrap returned an unrecognized outcome.",
          retryable: false,
        } satisfies BootstrapResponseBody,
        { status: 500 },
      );
    }
  }
}

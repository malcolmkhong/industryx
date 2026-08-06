/**
 * POST /api/telemetry/bootstrap
 *
 * Per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §19 + §21 PR 5:
 *   - Captures anonymized bootstrap outcomes emitted by the client
 *     orchestrator (states: ready | conflict | recovery_required |
 *     temporary_error | signed_out | signed_in) for diagnostics.
 *   - Privacy: deviceId is a generated UUID (no PII). We deliberately do
 *     NOT log email, IP, fingerprint raw value, or session tokens.
 *     user_id is captured only when the bootstrap resolves an auth session
 *     (no email, no PII attached).
 *   - Idempotent: dedupe by (device_id, created_at::minute) so client
 *     retries do not double-count (API-009).
 *   - Rate limit per deviceId via RATE_LIMITS.player (API-001/002/003).
 *
 * Failure modes (API-004):
 *   200 OK
 *   400 INVALID_TELEMETRY_BODY
 *   429 RATE_LIMITED
 *   503 TELEMETRY_UNAVAILABLE
 *   500 INTERNAL_TELEMETRY_ERROR
 */

import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { getDbClient } from '@/lib/db/access';

// ─── Validators ──────────────────────────────────────────────────────────

const VALID_OUTCOMES = new Set([
  "ready",
  "conflict",
  "recovery_required",
  "temporary_error",
  "signed_out",
  "signed_in",
] as const);

const VALID_SOURCES = new Set([
  "deviceId",
  "auth",
  "fresh",
  "sign_out_to_guest",
] as const);

const VALID_FINGERPRINT_STATUSES = new Set([
  "ok",
  "unavailable",
  "timeout",
] as const);

type TelemetryOutcome =
  | "ready"
  | "conflict"
  | "recovery_required"
  | "temporary_error"
  | "signed_out"
  | "signed_in";

interface NormalizedBody {
  deviceId: string;
  outcome: TelemetryOutcome;
  source: "deviceId" | "auth" | "fresh" | "sign_out_to_guest" | null;
  durationMs: number | null;
  fingerprintStatus: "ok" | "unavailable" | "timeout" | null;
  stateAtEmit: string | null;
  isGuest: boolean | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeAndValidate(input: unknown): { ok: true; body: NormalizedBody } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;

  // deviceId: required, generated UUID (length 8..128 per CHECK constraint).
  if (!isNonEmptyString(obj.deviceId)) {
    return { ok: false, error: "deviceId is required and must be a non-empty string" };
  }
  const deviceId = obj.deviceId.trim();
  if (deviceId.length < 8 || deviceId.length > 128) {
    return { ok: false, error: "deviceId length must be between 8 and 128" };
  }

  // outcome: required, whitelist.
  if (typeof obj.outcome !== "string" || !VALID_OUTCOMES.has(obj.outcome as TelemetryOutcome)) {
    return { ok: false, error: "outcome is required and must be one of ready|conflict|recovery_required|temporary_error|signed_out|signed_in" };
  }
  const outcome = obj.outcome as TelemetryOutcome;

  // source: optional, whitelist.
  let source: NormalizedBody["source"] = null;
  if (obj.source !== undefined && obj.source !== null) {
    if (typeof obj.source !== "string" || !VALID_SOURCES.has(obj.source as NormalizedBody["source"] & string)) {
      return { ok: false, error: "source, when provided, must be one of deviceId|auth|fresh|sign_out_to_guest" };
    }
    source = obj.source as NormalizedBody["source"];
  }

  // durationMs: optional, finite, bounded.
  let durationMs: number | null = null;
  if (obj.durationMs !== undefined && obj.durationMs !== null) {
    if (typeof obj.durationMs !== "number" || !Number.isFinite(obj.durationMs)) {
      return { ok: false, error: "durationMs, when provided, must be a finite number" };
    }
    const rounded = Math.trunc(obj.durationMs);
    if (rounded < 0 || rounded > 600_000) {
      return { ok: false, error: "durationMs must be between 0 and 600000" };
    }
    durationMs = rounded;
  }

  // fingerprintStatus: optional, whitelist only (no raw fingerprint value).
  let fingerprintStatus: NormalizedBody["fingerprintStatus"] = null;
  if (obj.fingerprintStatus !== undefined && obj.fingerprintStatus !== null) {
    if (
      typeof obj.fingerprintStatus !== "string" ||
      !VALID_FINGERPRINT_STATUSES.has(obj.fingerprintStatus as NormalizedBody["fingerprintStatus"] & string)
    ) {
      return { ok: false, error: "fingerprintStatus, when provided, must be one of ok|unavailable|timeout" };
    }
    fingerprintStatus = obj.fingerprintStatus as NormalizedBody["fingerprintStatus"];
  }

  // stateAtEmit: optional, bounded length.
  let stateAtEmit: string | null = null;
  if (obj.stateAtEmit !== undefined && obj.stateAtEmit !== null) {
    if (typeof obj.stateAtEmit !== "string") {
      return { ok: false, error: "stateAtEmit, when provided, must be a string" };
    }
    if (obj.stateAtEmit.length > 64) {
      return { ok: false, error: "stateAtEmit must be at most 64 characters" };
    }
    stateAtEmit = obj.stateAtEmit;
  }

  // isGuest: optional, boolean.
  let isGuest: boolean | null = null;
  if (obj.isGuest !== undefined && obj.isGuest !== null) {
    if (typeof obj.isGuest !== "boolean") {
      return { ok: false, error: "isGuest, when provided, must be a boolean" };
    }
    isGuest = obj.isGuest;
  }

  return {
    ok: true,
    body: {
      deviceId,
      outcome,
      source,
      durationMs,
      fingerprintStatus,
      stateAtEmit,
      isGuest,
    },
  };
}

// ─── Idempotency dedupe ─────────────────────────────────────────────────

/**
 * Returns true if an existing row for (deviceId, created_at::minute) with the
 * same outcome already exists. Used to absorb client retries within the same
 * minute window (API-009). Reads via service-role (RLS bypass).
 */
async function hasDedupedRow(
  supabase: NonNullable<ReturnType<typeof getDbClient>>,
  deviceId: string,
  outcome: TelemetryOutcome,
): Promise<boolean> {
  // date_trunc collapses created_at to the minute boundary. The check
  // intentionally includes the outcome so legitimately different outcomes
  // (e.g. ready -> signed_in within the same minute) are NOT deduped.
  const { data, error } = await supabase
    .from("bootstrap_telemetry")
    .select("id")
    .eq("device_id", deviceId)
    .eq("outcome", outcome)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString())
    .limit(1);

  if (error) {
    console.warn("[telemetry] dedupe lookup failed (continuing with insert):", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

// ─── Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Best-effort auth: telemetry is per deviceId, not per user. We still
  // honor any Supabase session user_id so server-side aggregation can group
  // rows by auth user, but the endpoint is accessible to anonymous callers.
  let authUserId: string | null = null;
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      authUserId = user.id;
    }
  } catch (err) {
    // Auth lookup is best-effort. Telemetry must not block on auth downtime.
    console.warn("[telemetry] auth.getUser failed (continuing):", err);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "request body must be valid JSON", code: "INVALID_TELEMETRY_BODY" },
      { status: 400 },
    );
  }

  const parsed = normalizeAndValidate(payload);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, code: "INVALID_TELEMETRY_BODY" },
      { status: 400 },
    );
  }
  const body = parsed.body;

  // Rate limit per deviceId (best-effort profile per existing bootstrap route).
  const limited = await checkRateLimit(
    body.deviceId,
    RATE_LIMITS.bootstrap,
    "/api/telemetry/bootstrap",
  );
  if (limited) return limited;

  const supabase = getDbClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "service unavailable", code: "TELEMETRY_UNAVAILABLE" },
      { status: 503 },
    );
  }

  // Idempotency dedupe: same deviceId + outcome within the current minute.
  try {
    const already = await hasDedupedRow(supabase, body.deviceId, body.outcome);
    if (already) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  } catch (err) {
    // Dedup lookup failure must not block telemetry capture.
    console.warn("[telemetry] dedupe check threw:", err);
  }

  // Insert the telemetry row via service-role. The CHECK constraints on the
  // table act as a second-layer validation in case the API-004 caller skips.
  const { error: insertError } = await supabase.from("bootstrap_telemetry").insert({
    device_id: body.deviceId,
    user_id: authUserId,
    outcome: body.outcome,
    source: body.source,
    duration_ms: body.durationMs,
    fingerprint_status: body.fingerprintStatus,
    state_at_emit: body.stateAtEmit,
    is_guest: body.isGuest,
  });

  if (insertError) {
    // 23505 = unique_violation (would happen if a true unique index existed);
    // CHECK constraint failures also surface here.
    console.error("[telemetry] insert failed:", insertError.message);
    return NextResponse.json(
      { error: "telemetry insert failed", code: "INTERNAL_TELEMETRY_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

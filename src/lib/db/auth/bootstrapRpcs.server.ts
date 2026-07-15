/**
 * src/lib/db/auth/bootstrapRpcs.server.ts
 *
 * Thin TypeScript wrapper over the 5 atomic bootstrap RPCs from migration 074.
 *
 * Per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §16, these RPCs are the canonical
 * atomic transaction boundary for every multi-step auth/identity/binding/
 * game-state write. This module:
 *
 *   1. Calls each RPC through the service-role Supabase client.
 *   2. Translates the typed RETURNS TABLE row into a discriminated union:
 *      success rows carry the typed payload; error rows carry error_code.
 *   3. Maps every PostgreSQL error (network, FK, RLS, parse) to
 *      INTERNAL_BOOTSTRAP_ERROR (plan §15) — never throws to the caller.
 *
 * Caller: src/lib/auth/server/bootstrapService.server.ts (PR 3).
 *
 * SECURITY: service-role only. This module MUST NOT be imported by client
 * code; the .server.ts suffix enforces that via Next.js convention.
 */

import { createServiceRoleClient } from '@/lib/db/access';;

// ─── Error codes (plan §15) ─────────────────────────────────────────────

export const BOOTSTRAP_ERROR_CODES = [
  "BOOTSTRAP_READY", // 200 — never returned by these RPCs; reserved for HTTP layer
  "INVALID_BOOTSTRAP_REQUEST", // 400
  "INVALID_SESSION", // 401
  "DEVICE_BOUND_TO_OTHER_USER", // 409
  "ACCOUNT_PROGRESS_CONFLICT", // 409
  "STATE_RECOVERY_REQUIRED", // 422
  "BOOTSTRAP_RATE_LIMITED", // 429
  "BOOTSTRAP_UNAVAILABLE", // 503
  "INTERNAL_BOOTSTRAP_ERROR", // 500 (default fallback)
] as const;

export type BootstrapErrorCode = (typeof BOOTSTRAP_ERROR_CODES)[number];

// ─── RPC row types (mirror migration 074 RETURNS TABLE) ─────────────────

/** bootstrap_guest: idempotent guest bootstrap via device_id */
export interface BootstrapGuestRow {
  status: "OK" | "ERROR";
  user_id: string | null;
  binding_id: string | null;
  is_new_user: boolean | null;
  has_game_state: boolean | null;
  error_code: BootstrapErrorCode | null;
}

/** bootstrap_authenticated: idempotent device-binding for auth user */
export interface BootstrapAuthenticatedRow {
  status: "OK" | "ERROR";
  binding_id: string | null;
  is_new_binding: boolean | null;
  has_profile: boolean | null;
  has_game_state: boolean | null;
  error_code: BootstrapErrorCode | null;
}

/** create_signed_out_guest_after_signout: preserves auth association */
export interface CreateSignedOutGuestRow {
  status: "OK" | "ERROR";
  guest_user_id: string | null;
  binding_id: string | null;
  is_new_guest: boolean | null;
  has_game_state: boolean | null;
  preserved_association_count: number | string | null; // pg bigint may return string
  error_code: BootstrapErrorCode | null;
}

/** upgrade_guest_to_auth: atomic guest-to-auth upgrade.
 *  Migration 079 added:
 *   - 'OK_ARCHIVED_GUEST' status: auth-wins-archive-guest policy applied,
 *     guest progress moved to guest_state_archive.
 *   - archive_receipt_id: id of the row in guest_state_archive.
 *   - policy_applied: which policy the RPC executed under. */
export type UpgradeStatus =
  | "OK"
  | "OK_NO_GUEST"
  | "OK_ARCHIVED_GUEST"
  | "CONFLICT"
  | "ERROR";
export type UpgradePolicy = "auth_wins_archive_guest" | "explicit_conflict";
export const UPGRADE_POLICIES: readonly UpgradePolicy[] = [
  "auth_wins_archive_guest",
  "explicit_conflict",
] as const;
export interface UpgradeGuestToAuthRow {
  status: UpgradeStatus;
  surviving_user_id: string | null;
  archived_guest_id: string | null;
  has_auth_progress: boolean | null;
  has_guest_progress: boolean | null;
  bindings_preserved: number | string | null;
  /** Present only when status='OK_ARCHIVED_GUEST'. */
  archive_receipt_id: string | null;
  /** Echoes the policy parameter the RPC executed under. */
  policy_applied: UpgradePolicy | string | null;
  error_code: BootstrapErrorCode | null;
}

/** ensure_profile_and_state: deterministic repair */
export interface EnsureProfileAndStateRow {
  status: "OK" | "ERROR";
  profile_created: boolean | null;
  state_created: boolean | null;
  needs_recovery: boolean | null;
  error_code: BootstrapErrorCode | null;
}

// ─── Discriminated union results ───────────────────────────────────────

export type RpcOutcome<T> =
  | { ok: true; row: T }
  | { ok: false; errorCode: BootstrapErrorCode; message: string };

// ─── Internal helpers ──────────────────────────────────────────────────

/**
 * Call an RPC and convert any thrown/returned error into a discriminator.
 * Returns the first row of the result set (RPCs are single-TABLE-return).
 *
 * Convention:
 *   - ok=false  -> RPC could not execute (no client, network/parse error).
 *                 Use this to detect infrastructure failures.
 *   - ok=true   -> RPC ran successfully and returned a row. Inspect
 *                  `row.status` and `row.error_code` for application-level
 *                  outcomes (STATE_RECOVERY_REQUIRED, ACCOUNT_PROGRESS_CONFLICT, etc).
 */
async function callRpc<T>(
  fnName: string,
  args: Record<string, unknown>,
): Promise<RpcOutcome<T>> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      ok: false,
      errorCode: "BOOTSTRAP_UNAVAILABLE",
      message: "service-role client is not configured",
    };
  }

  const { data, error } = await supabase.rpc(fnName, args);
  if (error) {
    // postgres errors / network / RLS / parse all map to INTERNAL_BOOTSTRAP_ERROR.
    // We log detail server-side; the HTTP layer at PR 3 must not leak it.
    console.error(`[bootstrapRpcs] ${fnName} postgres error:`, error);
    return {
      ok: false,
      errorCode: "INTERNAL_BOOTSTRAP_ERROR",
      message: error.message ?? "unknown RPC failure",
    };
  }

  const rows = (data as T[] | null) ?? [];
  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      errorCode: "INTERNAL_BOOTSTRAP_ERROR",
      message: `${fnName} returned no rows`,
    };
  }

  // Always surface the row; the row itself carries status + error_code so
  // callers can distinguish OK from application-level errors without losing
  // the structured payload (e.g. ACCOUNT_PROGRESS_CONFLICT carries archived_guest_id).
  return { ok: true, row };
}

/**
 * Inspect a row's status + error_code. Returns a non-null errorCode iff
 * the row represents an application-level error (per migration 074 mapping).
 */
export function rowErrorCode<T extends { status?: string | null; error_code?: BootstrapErrorCode | null }>(
  row: T,
): BootstrapErrorCode | null {
  if (row.error_code && row.error_code !== "BOOTSTRAP_READY") {
    return row.error_code;
  }
  // Some RPCs use status='ERROR' without an explicit error_code.
  if (row.status === "ERROR" && !row.error_code) {
    return "INTERNAL_BOOTSTRAP_ERROR";
  }
  return null;
}

// ─── 1. bootstrap_guest ────────────────────────────────────────────────

export interface BootstrapGuestArgs {
  deviceId: string;
  fingerprintHash?: string | null;
}

export type BootstrapGuestOutcome = RpcOutcome<BootstrapGuestRow>;

// eslint-disable-next-line require-await
export async function callBootstrapGuest(
  args: BootstrapGuestArgs,
): Promise<BootstrapGuestOutcome> {
  // Plan §4 step 7: deviceId is the primary key. Fingerprint is optional
  // telemetry only — never an identity lookup.
  if (!args.deviceId || args.deviceId.length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "deviceId is required",
    };
  }

  return callRpc<BootstrapGuestRow>("bootstrap_guest", {
    p_device_id: args.deviceId,
    p_fingerprint_hash: args.fingerprintHash ?? null,
  });
}

// ─── 2. bootstrap_authenticated ─────────────────────────────────────────

export interface BootstrapAuthenticatedArgs {
  authUserId: string;
  deviceId: string;
}

export type BootstrapAuthenticatedOutcome =
  RpcOutcome<BootstrapAuthenticatedRow>;

// eslint-disable-next-line require-await
export async function callBootstrapAuthenticated(
  args: BootstrapAuthenticatedArgs,
): Promise<BootstrapAuthenticatedOutcome> {
  // UUID validation: avoid the RPC having to translate a parse error.
  if (!isUuid(args.authUserId)) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "authUserId must be a valid UUID",
    };
  }
  if (!args.deviceId || args.deviceId.length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "deviceId is required",
    };
  }

  return callRpc<BootstrapAuthenticatedRow>("bootstrap_authenticated", {
    p_auth_user_id: args.authUserId,
    p_device_id: args.deviceId,
  });
}

// ─── 3. create_signed_out_guest_after_signout ──────────────────────────

export interface CreateSignedOutGuestArgs {
  /** May be null for users who never authenticated. */
  authUserId: string | null;
  deviceId: string;
}

export type CreateSignedOutGuestOutcome =
  RpcOutcome<CreateSignedOutGuestRow>;

// eslint-disable-next-line require-await
export async function callCreateSignedOutGuestAfterSignout(
  args: CreateSignedOutGuestArgs,
): Promise<CreateSignedOutGuestOutcome> {
  if (args.authUserId !== null && !isUuid(args.authUserId)) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "authUserId must be a valid UUID or null",
    };
  }
  if (!args.deviceId || args.deviceId.length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "deviceId is required",
    };
  }

  return callRpc<CreateSignedOutGuestRow>("create_signed_out_guest_after_signout", {
    p_auth_user_id: args.authUserId,
    p_device_id: args.deviceId,
  });
}

// ─── 4. upgrade_guest_to_auth ──────────────────────────────────────────

/** Migration 079: policy parameter controls sign-in merge behavior.
 *  Default ('auth_wins_archive_guest'): auto-archive guest, load auth.
 *  'explicit_conflict': return 409 for opt-in users. */
export interface UpgradeGuestToAuthArgs {
  authUserId: string;
  deviceId: string;
  /** Server-side policy. Defaults to auth_wins_archive_guest per Migration 079. */
  policy?: UpgradePolicy;
}

export type UpgradeGuestToAuthOutcome = RpcOutcome<UpgradeGuestToAuthRow>;

// eslint-disable-next-line require-await
export async function callUpgradeGuestToAuth(
  args: UpgradeGuestToAuthArgs,
): Promise<UpgradeGuestToAuthOutcome> {
  if (!isUuid(args.authUserId)) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "authUserId must be a valid UUID",
    };
  }
  if (!args.deviceId || args.deviceId.length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "deviceId is required",
    };
  }
  const policy: UpgradePolicy = args.policy ?? "auth_wins_archive_guest";
  if (!UPGRADE_POLICIES.includes(policy)) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: `policy must be one of ${UPGRADE_POLICIES.join(", ")}`,
    };
  }

  return callRpc<UpgradeGuestToAuthRow>("upgrade_guest_to_auth", {
    p_auth_user_id: args.authUserId,
    p_device_id: args.deviceId,
    p_policy: policy,
  });
}

// ─── 5. ensure_profile_and_state ───────────────────────────────────────

export interface EnsureProfileAndStateArgs {
  userId: string;
}

export type EnsureProfileAndStateOutcome =
  RpcOutcome<EnsureProfileAndStateRow>;

// eslint-disable-next-line require-await
export async function callEnsureProfileAndState(
  args: EnsureProfileAndStateArgs,
): Promise<EnsureProfileAndStateOutcome> {
  if (!isUuid(args.userId)) {
    return {
      ok: false,
      errorCode: "INVALID_BOOTSTRAP_REQUEST",
      message: "userId must be a valid UUID",
    };
  }

  return callRpc<EnsureProfileAndStateRow>("ensure_profile_and_state", {
    p_user_id: args.userId,
  });
}

// ─── Internal utilities ────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

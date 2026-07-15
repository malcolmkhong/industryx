/**
 * src/lib/auth/server/bootstrapService.server.ts
 *
 * SINGLE shared server-side bootstrap service per
 * AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §4. The HTTP layer at
 * `src/app/api/auth/bootstrap/route.ts` is the only caller. Nothing else in
 * the server should attempt to resolve identity, device bindings, or initial
 * game state outside this module.
 *
 * Responsibilities (plan §4 step 8–11):
 *   1. Resolve guest or authenticated identity using the 5 atomic RPCs.
 *   2. Ensure profile + server_game_state exist or return STATE_RECOVERY_REQUIRED.
 *   3. Validate ownership and return bootstrap-ready payload.
 *   4. Map every RPC outcome to a typed `BootstrapResult` discriminated union
 *      (callers map union -> HTTP status per plan §15).
 *
 * Identity rules (plan §4-§13):
 *   - No session  -> guest bootstrap.
 *   - Session     -> authenticated bootstrap; evaluate guest upgrade.
 *   - previousAuthUserId differs from current session user -> sign-out flow.
 *
 * The service returns the canonical server_game_state snapshot with
 * BOOTSTRAP_READY. Guests do not have an authenticated browser session, so
 * returning guest progress cannot depend on the legacy cloud-sync load path.
 */

import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildCompleteFullStateForServerRow,
  loadServerGameStateLite,
} from "@/lib/db/game/serverGameState";
import {
  callBootstrapGuest,
  callBootstrapAuthenticated,
  callCreateSignedOutGuestAfterSignout,
  callUpgradeGuestToAuth,
  callEnsureProfileAndState,
  rowErrorCode,
  type BootstrapErrorCode,
  type BootstrapGuestRow,
  type BootstrapAuthenticatedRow,
  type CreateSignedOutGuestRow,
  type UpgradeGuestToAuthRow,
  type UpgradePolicy,
} from "@/lib/db/auth/bootstrapRpcs.server";
import type { ServerGameData } from "@/lib/game/shared/types/types";

// ─── Public typed result surface ───────────────────────────────────────

/**
 * Reason for resolving an identity. Server-authoritative so the client can
 * log it without recomputing.
 */
export type BootstrapSource =
  | "deviceId"
  | "auth"
  | "fresh"
  | "sign_out_to_guest";

export interface BootstrapReadyPayload {
  userId: string;
  bindingId: string;
  isGuest: boolean;
  /** True only on first call for a brand-new device + new identity. */
  isNewUser: boolean;
  source: BootstrapSource;
  hasGameState: boolean;
  /** When true, orchestrator must load game state after this response. */
  needsStateLoad: boolean;
  /** Server-owned, canonical-hydrated game state ready for client apply. */
  gameState: ServerGameData;
  /**
   * Migration 079: when auth-wins-archive-guest policy archived a guest
   * at sign-in, this id points to the recoverable snapshot row in
   * `guest_state_archive`. Optional field; absent when no archive happened.
   */
  archiveReceiptId?: string | null;
  /** Migration 079: same as `archiveReceiptId`. Both flow through to the
   *  HTTP layer so the UI can render a one-time archive banner. */
  archivedGuestId?: string | null;
}

export interface BootstrapConflictPayload {
  reason: "DEVICE_BOUND_TO_OTHER_USER" | "ACCOUNT_PROGRESS_CONFLICT";
  /**
   * For ACCOUNT_PROGRESS_CONFLICT, the surviving auth + archived guest ids
   * are returned so the UI can present a merge-conflict panel.
   */
  survivingUserId?: string | null;
  archivedGuestId?: string | null;
}

export type BootstrapResult =
  | { kind: "ready"; ready: BootstrapReadyPayload }
  | { kind: "conflict"; conflict: BootstrapConflictPayload }
  | { kind: "recovery_required" }
  | { kind: "invalid_request"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "internal_error"; reason: string };

// ─── Service inputs ────────────────────────────────────────────────────

export interface BootstrapServiceArgs {
  /** Persistent client-generated device id (required). */
  deviceId: string;
  /** Optional fingerprint SHA-256, telemetry-only per plan §4 step 6. */
  fingerprintHash?: string | null;
  /**
   * When the client is transitioning from authenticated -> signed-out, it
   * supplies the previously authenticated user id. Triggers the
   * create_signed_out_guest_after_signout path (plan §6 step 4).
   * Omitted on the regular guest/auth bootstrap flows.
   */
  previousAuthUserId?: string | null;
  /**
   * Migration 079: per-request merge policy forwarded to
   * upgrade_guest_to_auth. Defaults to 'auth_wins_archive_guest'.
   *
   * In production the caller (HTTP layer) should resolve this from the
   * user's `profiles.auth_merge_policy` row before invoking the service.
   * For backward compat we accept any value here and forward it through.
   */
  mergePolicy?: UpgradePolicy;
}

// ─── Entry point ───────────────────────────────────────────────────────

export async function runBootstrap(
  args: BootstrapServiceArgs,
): Promise<BootstrapResult> {
  // ── Request validation ───────────────────────────────────────────────
  if (!args.deviceId || args.deviceId.trim().length === 0) {
    return { kind: "invalid_request", reason: "deviceId is required" };
  }

  // ── Resolve current Supabase session (plan §6) ───────────────────────
  const sessionUserId = await resolveSessionUserId();

  // ── Sign-out transition flow (plan §6 step 4) ────────────────────────
  // previousAuthUserId is set ONLY when the client is intentionally signing out.
  // The previous session user should NOT equal the current session user:
  // - No current session + previousAuthUserId -> signed-out, create new guest.
  // - Current session user == previousAuthUserId -> idempotent (treat as auth bootstrap).
  if (
    args.previousAuthUserId &&
    args.previousAuthUserId !== sessionUserId
  ) {
    return runSignOutToGuest(args.deviceId, args.previousAuthUserId);
  }

  // ── No session -> guest bootstrap ────────────────────────────────────
  if (!sessionUserId) {
    return runGuestBootstrap(args.deviceId, args.fingerprintHash ?? null);
  }

  // ── Authenticated bootstrap (plan §6 returning user) ─────────────────
  return runAuthenticatedBootstrap(sessionUserId, args.deviceId, args);
}

// ─── Path: guest bootstrap ──────────────────────────────────────────────

async function runGuestBootstrap(
  deviceId: string,
  fingerprintHash: string | null,
): Promise<BootstrapResult> {
  const rpc = await callBootstrapGuest({
    deviceId,
    fingerprintHash,
  });

  if (!rpc.ok) return mapRpcError(rpc.errorCode);
  const row = rpc.row;
  const err = rowErrorCode(row);
  if (err) return mapRpcError(err);

  if (
    !row.user_id ||
    !row.binding_id ||
    row.status === "ERROR" ||
    row.is_new_user === null ||
    row.has_game_state === null
  ) {
    return {
      kind: "internal_error",
      reason: "bootstrap_guest returned a malformed row",
    };
  }

  const gameState = await loadBootstrapGameState(row.user_id);
  if (!gameState) {
    return { kind: "recovery_required" };
  }

  return {
    kind: "ready",
    ready: {
      userId: row.user_id,
      bindingId: row.binding_id,
      isGuest: true,
      isNewUser: row.is_new_user,
      source: row.is_new_user ? "fresh" : "deviceId",
      hasGameState: row.has_game_state,
      needsStateLoad: false,
      gameState,
    },
  };
}

// ─── Path: authenticated bootstrap (includes upgrade evaluation) ───────

async function runAuthenticatedBootstrap(
  authUserId: string,
  deviceId: string,
  args: BootstrapServiceArgs,
): Promise<BootstrapResult> {
  // 1. Ensure device binding exists (idempotent, no state creation).
  const bindRes = await callBootstrapAuthenticated({
    authUserId,
    deviceId,
  });
  if (!bindRes.ok) return mapRpcError(bindRes.errorCode);

  const bindRow = bindRes.row;
  const bindErr = rowErrorCode(bindRow);
  if (bindErr === "STATE_RECOVERY_REQUIRED") {
    return { kind: "recovery_required" };
  }
  if (bindErr) return mapRpcError(bindErr);
  if (!bindRow.binding_id || bindRow.has_game_state === null) {
    return {
      kind: "internal_error",
      reason: "bootstrap_authenticated returned a malformed row",
    };
  }

  // 2. Evaluate upgrade eligibility. Migration 079 controls how an
  //    active_guest binding is resolved against the auth user's existing
  //    progress. The merge policy is forwarded from the caller:
  //      - 'auth_wins_archive_guest' (default): both-have-progress
  //        archives guest progress (recoverable) and returns
  //        status='OK_ARCHIVED_GUEST' with archive_receipt_id.
  //      - 'explicit_conflict': both-have-progress returns CONFLICT
  //        for the user to resolve manually (legacy behavior).
  //    Other outcomes:
  //      - OK_NO_GUEST: no active guest binding; just bind + load.
  //      - OK:          guest moved to auth (no archive needed).
  //      - ERROR:       missing auth user → recovery_required.
  const upgradeRes = await callUpgradeGuestToAuth({
    authUserId,
    deviceId,
    policy: args.mergePolicy,
  });
  if (!upgradeRes.ok) return mapRpcError(upgradeRes.errorCode);
  const upgradeRow = upgradeRes.row;
  const upgradeErr = rowErrorCode(upgradeRow);

  // EXPLICIT_CONFLICT: surface the 409 (only triggered for opt-in users
  // who set profiles.auth_merge_policy='explicit_conflict'). The default
  // 'auth_wins_archive_guest' policy auto-archives and returns
  // 'OK_ARCHIVED_GUEST' below — never the CONFLICT branch.
  if (upgradeRow.status === "CONFLICT") {
    return {
      kind: "conflict",
      conflict: {
        reason: "ACCOUNT_PROGRESS_CONFLICT",
        survivingUserId: upgradeRow.surviving_user_id,
        archivedGuestId: upgradeRow.archived_guest_id,
      },
    };
  }
  if (upgradeErr === "STATE_RECOVERY_REQUIRED") {
    return { kind: "recovery_required" };
  }
  if (upgradeErr) return mapRpcError(upgradeErr);

  // Audit log entry when guest progress was archived. Industry-standard
  // accountability: explicit traceable record of every merge decision.
  if (upgradeRow.status === "OK_ARCHIVED_GUEST" && upgradeRow.archived_guest_id) {
    console.info(
      "[bootstrap] guest archived on sign-in",
      JSON.stringify({
        archived_guest_id: upgradeRow.archived_guest_id,
        auth_user_id: authUserId,
        archive_receipt_id: upgradeRow.archive_receipt_id,
        policy: upgradeRow.policy_applied,
        device_id: deviceId,
      }),
    );
  }

  // 3. Repair check: if no game state exists for the auth user after
  //    upgrade, run deterministic repair; otherwise surface recovery.
  const hasGameState =
    upgradeRow.has_auth_progress === true ||
    bindRow.has_game_state === true;

  if (!hasGameState) {
    const repair = await callEnsureProfileAndState({ userId: authUserId });
    if (!repair.ok) return mapRpcError(repair.errorCode);
    const repairRow = repair.row;
    const repairErr = rowErrorCode(repairRow);
    if (repairErr === "STATE_RECOVERY_REQUIRED") {
      return { kind: "recovery_required" };
    }
    if (repairErr) return mapRpcError(repairErr);
  }

  const gameState = await loadBootstrapGameState(authUserId);
  if (!gameState) {
    return { kind: "recovery_required" };
  }

  // 4. (Silent no-op for plan-defined DEVICE_BOUND_TO_OTHER_USER cases:
  //    the upgrade RPC returns OK_NO_GUEST when there is no upgradeable
  //    guest binding on this device, which is the correct non-conflict
  //    answer. Genuine DEVICE_BOUND_TO_OTHER_USER conflicts are surfaced
  //    via a separate "conflict" evaluator in a future PR; the RPC layer
  //    cannot distinguish owned-by-another-auth from no-binding here.)

  return {
    kind: "ready",
    ready: {
      userId: authUserId,
      bindingId: bindRow.binding_id,
      isGuest: false,
      isNewUser: bindRow.is_new_binding === true,
      source: "auth",
      hasGameState,
      needsStateLoad: false,
      gameState,
      // Migration 079: surface the archive receipt when auth-wins-archive-guest
      // policy archived a guest at sign-in. UI can render a one-time banner.
      archiveReceiptId:
        upgradeRow.status === "OK_ARCHIVED_GUEST"
          ? upgradeRow.archive_receipt_id
          : null,
      archivedGuestId:
        upgradeRow.status === "OK_ARCHIVED_GUEST"
          ? upgradeRow.archived_guest_id
          : null,
    },
  };
}

// ─── Path: signed-out -> new guest ─────────────────────────────────────

async function runSignOutToGuest(
  deviceId: string,
  previousAuthUserId: string,
): Promise<BootstrapResult> {
  const res = await callCreateSignedOutGuestAfterSignout({
    authUserId: previousAuthUserId,
    deviceId,
  });

  if (!res.ok) return mapRpcError(res.errorCode);
  const row = res.row;
  const err = rowErrorCode(row);
  if (err) return mapRpcError(err);
  if (
    !row.guest_user_id ||
    !row.binding_id ||
    row.status === "ERROR" ||
    row.is_new_guest === null ||
    row.has_game_state === null
  ) {
    return {
      kind: "internal_error",
      reason: "create_signed_out_guest returned a malformed row",
    };
  }

  const gameState = await loadBootstrapGameState(row.guest_user_id);
  if (!gameState) {
    return { kind: "recovery_required" };
  }

  return {
    kind: "ready",
    ready: {
      userId: row.guest_user_id,
      bindingId: row.binding_id,
      isGuest: true,
      // A fresh guest is new except when we reused an existing active binding.
      isNewUser: row.is_new_guest,
      source: "sign_out_to_guest",
      hasGameState: row.has_game_state,
      needsStateLoad: false,
      gameState,
    },
  };
}

async function loadBootstrapGameState(
  userId: string,
): Promise<ServerGameData | null> {
  try {
    const stateRow = await loadServerGameStateLite(userId);
    if (!stateRow) return null;
    return await buildCompleteFullStateForServerRow(stateRow);
  } catch (error) {
    console.error("[bootstrap] failed to load server game state:", error);
    return null;
  }
}

// ─── Session resolution ────────────────────────────────────────────────

async function resolveSessionUserId(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// ─── RPC error mapping ─────────────────────────────────────────────────

function mapRpcError(errorCode: BootstrapErrorCode): BootstrapResult {
  switch (errorCode) {
    case "STATE_RECOVERY_REQUIRED":
      return { kind: "recovery_required" };
    case "INVALID_BOOTSTRAP_REQUEST":
      // Should not happen — input validation catches these before RPC.
      return { kind: "invalid_request", reason: errorCode };
    case "BOOTSTRAP_RATE_LIMITED":
      return { kind: "unavailable", reason: "rate_limited" };
    case "BOOTSTRAP_UNAVAILABLE":
      return { kind: "unavailable", reason: "service_unavailable" };
    case "INVALID_SESSION":
    case "DEVICE_BOUND_TO_OTHER_USER":
    case "ACCOUNT_PROGRESS_CONFLICT":
    case "BOOTSTRAP_READY":
    case "INTERNAL_BOOTSTRAP_ERROR":
    default:
      return { kind: "internal_error", reason: errorCode };
  }
}

// ─── Internal row types re-exported for callers (e.g. tests) ───────────

export type {
  BootstrapGuestRow,
  BootstrapAuthenticatedRow,
  CreateSignedOutGuestRow,
  UpgradeGuestToAuthRow,
};

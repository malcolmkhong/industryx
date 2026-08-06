/**
 * playerDelete — Server-authoritative player deletion.
 *
 * This module is the ONLY place that calls the `delete_player_cascade`
 * RPC. Routes must import `deletePlayerCascade` instead of invoking the
 * RPC directly. The migration 090_player_delete_cascade.sql defines the
 * RPC; this module is the typed wrapper.
 *
 * Why a dedicated module:
 *   - Centralizes error handling for the RPC JSONB response.
 *   - Decouples the route from `getDbClient()` plumbing.
 *   - Enforces fail-closed semantics: returns a discriminated result,
 *     never throws on RPC outcomes (caller decides what to surface).
 *
 * Conventions:
 *   - All async functions return a typed result object — never throw.
 *   - Caller handles auth, rate limit, response shaping, and audit log.
 */

import { getDbClient } from '@/lib/db/access';

/**
 * Result of a single delete attempt.
 */
export type DeletePlayerResult =
  | {
      ok: true;
      userId: string;
      tombstonedAdminActions: number;
      deletedGuestIdentities: number;
      deletedDeviceBindings: number;
    }
  | {
      ok: false;
      reason:
        | "USER_NOT_FOUND"
        | "RPC_FAILED"
        | "DB_UNAVAILABLE";
      message: string;
      userId: string;
    };

/**
 * Result of a bulk delete. Always returns per-user results so the route
 * can build a partial-success response (similar to setPlayerLockStateBulk).
 */
export interface BulkDeleteResult {
  successCount: number;
  failCount: number;
  failures: Array<{ userId: string; reason: string }>;
}

/**
 * Fully delete a single player via the delete_player_cascade RPC.
 *
 * Service-role only. Caller must have already verified admin write
 * permission and the super-admin requirement.
 *
 * The RPC:
 *   - Tombstones admin_actions.target_user_id (preserves audit rows).
 *   - Explicitly deletes guest_identities + device_bindings rows.
 *   - Deletes auth.users, cascading all gameplay tables with
 *     ON DELETE CASCADE FKs (player_progress, server_game_state,
 *     player_actions, player_sessions, validated_actions,
 *     cheat_investigations, leaderboard_entries, trade_history,
 *     support_tickets, support_ticket_messages, daily_rewards,
 *     daily_login_streaks, profiles).
 *
 * Returns a discriminated result. Never throws.
 */
export async function deletePlayerCascade(
  userId: string,
): Promise<DeletePlayerResult> {
  const supabase = getDbClient();
  if (!supabase) {
    return {
      ok: false,
      reason: "DB_UNAVAILABLE",
      message: "Service role client is not configured",
      userId,
    };
  }

  const { data, error } = await supabase.rpc("delete_player_cascade", {
    p_user_id: userId,
  });

  if (error) {
    console.error(
      "[playerDelete] delete_player_cascade RPC failed:",
      error.message,
    );
    return {
      ok: false,
      reason: "RPC_FAILED",
      message: error.message,
      userId,
    };
  }

  const payload = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    user_id?: string;
    tombstoned_admin_actions?: number;
    deleted_guest_identities?: number;
    deleted_device_bindings?: number;
  };

  if (payload.ok === false) {
    return {
      ok: false,
      reason: (payload.reason as DeletePlayerResult extends infer R
        ? R extends { ok: false; reason: infer X }
          ? X
          : never
        : never) ?? "USER_NOT_FOUND",
      message: payload.reason ?? "USER_NOT_FOUND",
      userId,
    };
  }

  return {
    ok: true,
    userId,
    tombstonedAdminActions: payload.tombstoned_admin_actions ?? 0,
    deletedGuestIdentities: payload.deleted_guest_identities ?? 0,
    deletedDeviceBindings: payload.deleted_device_bindings ?? 0,
  };
}

/**
 * Delete many players. Returns per-user failures so the route can
 * build a partial-success response.
 *
 * RPCs run in parallel — they are independent (each operates on its own
 * user_id inside the SECURITY DEFINER RPC). The cap of 100 users per
 * bulk action keeps the connection pool safe.
 */
export async function deletePlayersCascadeBulk(
  userIds: string[],
): Promise<BulkDeleteResult> {
  if (userIds.length === 0) {
    return { successCount: 0, failCount: 0, failures: [] };
  }

  const results = await Promise.all(userIds.map(deletePlayerCascade));

  const out: BulkDeleteResult = {
    successCount: 0,
    failCount: 0,
    failures: [],
  };

  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.ok) {
      out.successCount += 1;
    } else {
      out.failCount += 1;
      out.failures.push({ userId: userIds[i], reason: r.reason });
    }
  }

  return out;
}
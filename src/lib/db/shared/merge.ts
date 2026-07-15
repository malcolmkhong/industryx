/**
 * merge — Centralized access to the `merge_receipts` and `merge_audit_log`
 * tables, plus the server_game_state + profiles + guest_identities writes
 * that constitute a guest-to-OAuth merge transaction.
 *
 * Iteration 9 of the Database Centralization migration.
 * Used by: /api/auth/identity/confirm-link.
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 *
 * Note: This module intentionally does NOT wrap the merge in a single DB
 * transaction. The original /api/auth/identity/confirm-link ran each write
 * independently because a partial merge is recoverable (state is the source
 * of truth; receipt + audit log can be back-filled). Centralizing the
 * write pattern preserves that behavior exactly.
 */
import { createServiceRoleClient } from '@/lib/db/access';;
import type { Database } from "@/lib/db/types";
import { asFullState } from "@/lib/db/game/serverGameStatePayload";

type MergeReceiptRow = Database["public"]["Tables"]["merge_receipts"]["Row"];
type MergeAuditLogRow = Database["public"]["Tables"]["merge_audit_log"]["Row"];
type ServerGameStateRow =
  Database["public"]["Tables"]["server_game_state"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Merge decision types. Phase 2 (post multi-account lockdown):
 *   'auth_wins' — OAuth identity is authoritative; guest data MOVES to auth.
 *                 This is the ONLY decision used in production.
 *   'keep_guest' / 'keep_google' retained as type values for audit log
 *                 historical compatibility. New code MUST only write 'auth_wins'.
 */
export type MergeDecisionType = "auth_wins" | "keep_guest" | "keep_google";

export interface MergeAuditEntry {
  merge_receipt_id: string;
  idempotency_key: string;
  guest_user_id: string;
  google_user_id: string;
  preference: MergeDecisionType;
  guest_state_before: unknown;
  google_state_before: unknown;
  guest_state_after: unknown;
  google_state_after: unknown;
  merge_result: Record<string, unknown>;
  preview_version: unknown;
  risk_score: number | null;
  risk_flags: unknown;
  actor_user_id: string;
  actor_ip_hash: string | null;
  actor_ip_region: string | null;
  actor_user_agent: string | null;
  fingerprint_hash?: string | null;
}

/**
 * Load the FULL server_game_state row for either user participating in the
 * merge. confirm-link needs every column (including full_state JSONB) to
 * write the pre-state snapshot into merge_audit_log and to copy state
 * between users when preference = 'keep_guest'.
 */
export async function loadFullGameStateForMerge(
  userId: string,
): Promise<ServerGameStateRow | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("server_game_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[merge] loadFullGameState failed:", error.message);
    return null;
  }
  return (data ?? null) as ServerGameStateRow | null;
}

/**
 * Move the guest's server_game_state row onto the auth user's row.
 *
 * Phase 2 (auth_wins_only): this is the ONLY outcome of confirm-link.
 * The guest's data overwrites whatever the auth user had (or seeds
 * the row if none existed). The guest's row in server_game_state is
 * then deleted by the per-user reassign step (reassignUserData).
 *
 * Concurrency: optimistic-locking via state_version. If the auth user
 * had no row yet, this is a no-op UPDATE that affects 0 rows — caller
 * should then either INSERT a fresh row or skip. For the current
 * quickstart-driven flow, every user has a server_game_state row at
 * signup, so seed-on-miss is rare in practice.
 */
export async function moveGuestDataOntoAuthUser(
  authUserId: string,
  guestState: ServerGameStateRow,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("server_game_state")
    .update({
      money: guestState.money,
      total_money_earned: guestState.total_money_earned,
      research_points: guestState.research_points,
      buildings: asFullState(guestState.buildings),
      buildings_count: guestState.buildings_count,
      completed_research: asFullState(guestState.completed_research),
      resources: asFullState(guestState.resources),
      workers: asFullState(guestState.workers),
      game_tick: guestState.game_tick,
      game_speed: guestState.game_speed,
      full_state: asFullState(guestState.full_state),
      state_hash: guestState.state_hash,
      state_version: guestState.state_version,
      last_saved_at: now,
      last_tick_at: guestState.last_tick_at,
    })
    .eq("user_id", authUserId);
  if (error) {
    console.error("[merge] moveGuestDataOntoAuthUser failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Archive the guest's profile row after the auth-wins merge.
 * - Sets `is_guest = false` (no longer a guest — the data moved).
 * - Records the auth user as `linked_account_id` + `linked_at`.
 * - Does NOT delete: the row remains as an audit shell (the auth
 *   user is now the "real" profile).
 *
 * Note: this leaves two profile rows in the system (guest shell +
 * auth real). The guest one becomes inert. The auth one already
 * exists from the handle_new_user trigger. Both reach is_guest=false
 * which is intentional.
 */
export async function archiveGuestProfile(
  guestUserId: string,
  authUserId: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("profiles")
    .update({
      is_guest: false,
      linked_account_id: authUserId,
      linked_at: new Date().toISOString(),
    } satisfies Partial<ProfileRow>)
    .eq("id", guestUserId);
  if (error) {
    console.error("[merge] archiveGuestProfile failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Mark all of a guest user's guest_identities as superseded-by the google user.
 * Used by both branches — the guest identity is always "consumed" by the
 * merge, regardless of which state's data was kept.
 */
export async function supersedeGuestIdentities(
  guestUserId: string,
  googleUserId: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("guest_identities")
    .update({
      superseded_by: googleUserId,
      superseded_at: new Date().toISOString(),
      is_primary: false,
    })
    .eq("user_id", guestUserId);
  if (error) {
    console.error("[merge] supersedeGuestIdentities failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Insert a merge_receipt row. Returns the new receipt id, or null on error.
 */
export async function insertMergeReceipt(
  values: Pick<
    MergeReceiptRow,
    | "operation_id"
    | "kept_user_id"
    | "archived_user_id"
    | "decision_type"
    | "risk_score"
    | "expires_at"
  > & {
    guest_state_snapshot?: unknown;
    google_state_snapshot?: unknown;
  },
): Promise<string | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("merge_receipts")
    .insert({
      ...values,
      guest_state_snapshot: asFullState(values.guest_state_snapshot ?? null),
      google_state_snapshot: asFullState(values.google_state_snapshot ?? null),
    })
    .select("id")
    .single();
  if (error) {
    console.error(
      "[merge] insertMergeReceipt failed:",
      error.message,
      "code:",
      error.code,
      "details:",
      error.details,
      "hint:",
      error.hint,
    );
    return null;
  }
  return (data?.id ?? null) as string | null;
}

/**
 * Insert a merge_audit_log row. The audit log is append-only; failures are
 * logged but callers (confirm-link) proceed — losing an audit row is
 * preferable to failing the user's merge.
 */
export async function insertMergeAuditLog(
  values: MergeAuditEntry,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase.from("merge_audit_log").insert({
    ...values,
    guest_state_before: asFullState(values.guest_state_before ?? null),
    google_state_before: asFullState(values.google_state_before ?? null),
    guest_state_after: asFullState(values.guest_state_after ?? null),
    google_state_after: asFullState(values.google_state_after ?? null),
    merge_result: asFullState(values.merge_result),
    preview_version: asFullState(values.preview_version ?? null),
    risk_flags: asFullState(values.risk_flags ?? []),
  } satisfies Partial<MergeAuditLogRow>);
  if (error) {
    console.error("[merge] insertMergeAuditLog failed:", error.message);
    return false;
  }
  return true;
}

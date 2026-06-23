/**
 * merge — Centralized access to the `merge_receipts` and `merge_audit_log`
 * tables, plus the server_game_state + profiles + guest_identities writes
 * that constitute a guest-to-OAuth merge transaction.
 *
 * Iteration 9 of the Database Centralization migration.
 * Used by: /api/auth/confirm-link.
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 *
 * Note: This module intentionally does NOT wrap the merge in a single DB
 * transaction. The original /api/auth/confirm-link ran each write
 * independently because a partial merge is recoverable (state is the source
 * of truth; receipt + audit log can be back-filled). Centralizing the
 * write pattern preserves that behavior exactly.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

type MergeReceiptRow = Database['public']['Tables']['merge_receipts']['Row'];
type MergeAuditLogRow = Database['public']['Tables']['merge_audit_log']['Row'];
type ServerGameStateRow = Database['public']['Tables']['server_game_state']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type MergeDecisionType = 'keep_guest' | 'keep_google';

export interface MergeReceipt {
  id: string;
  operation_id: string;
  kept_user_id: string;
  archived_user_id: string | null;
  decision_type: string;
  guest_state_snapshot: unknown;
  google_state_snapshot: unknown;
  risk_score: number | null;
  created_at: string | null;
  expires_at: string;
}

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
    .from('server_game_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[merge] loadFullGameState failed:', error.message);
    return null;
  }
  return (data ?? null) as ServerGameStateRow | null;
}

/**
 * Persist the winning state's columns onto the surviving user's row, then
 * stamp `last_saved_at` + `last_tick_at`. Used when preference = 'keep_guest':
 * the guest's data is "kept" by writing it onto itself (refreshes timestamps
 * and forces a row-level update so the state_version increments if there
 * were concurrent writes).
 *
 * Returns true on success. Returns false if the state row was missing —
 * callers may choose to continue (fresh users have no state) or 500.
 */
export async function persistGuestStateOnSurvivingUser(
  guestUserId: string,
  guestState: ServerGameStateRow,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('server_game_state')
    .update({
      money: guestState.money,
      total_money_earned: guestState.total_money_earned,
      research_points: guestState.research_points,
      buildings: guestState.buildings as never,
      buildings_count: guestState.buildings_count,
      completed_research: guestState.completed_research,
      resources: guestState.resources as never,
      workers: guestState.workers as never,
      game_tick: guestState.game_tick,
      game_speed: guestState.game_speed,
      full_state: guestState.full_state as never,
      state_hash: guestState.state_hash,
      state_version: guestState.state_version,
      last_saved_at: now,
      last_tick_at: now,
    })
    .eq('user_id', guestUserId);
  if (error) {
    console.error('[merge] persistGuestStateOnSurvivingUser failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Touch last_saved_at + last_tick_at on the surviving (google) user when
 * preference = 'keep_google'. No other column is overwritten — google's
 * existing state remains authoritative.
 */
export async function touchGameStateForSurvivingGoogleUser(
  googleUserId: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('server_game_state')
    .update({ last_saved_at: now, last_tick_at: now })
    .eq('user_id', googleUserId);
  if (error) {
    console.error('[merge] touchGameStateForSurvivingGoogleUser failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Flip the guest profile to is_guest=false + record linked_account_id +
 * linked_at. Used by keep_guest branch.
 */
export async function linkGuestProfileToGoogle(
  guestUserId: string,
  googleUserId: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('profiles')
    .update({
      is_guest: false,
      linked_account_id: googleUserId,
      linked_at: new Date().toISOString(),
    } satisfies Partial<ProfileRow>)
    .eq('id', guestUserId);
  if (error) {
    console.error('[merge] linkGuestProfileToGoogle failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Flip the guest profile to is_guest=false (no linked_account_id link).
 * Used by keep_google branch — the guest profile is preserved as a stub
 * but no longer "guest-only".
 */
export async function clearGuestFlagOnProfile(guestUserId: string): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ is_guest: false } satisfies Partial<ProfileRow>)
    .eq('id', guestUserId);
  if (error) {
    console.error('[merge] clearGuestFlagOnProfile failed:', error.message);
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
    .from('guest_identities')
    .update({
      superseded_by: googleUserId,
      superseded_at: new Date().toISOString(),
      is_primary: false,
    })
    .eq('user_id', guestUserId);
  if (error) {
    console.error('[merge] supersedeGuestIdentities failed:', error.message);
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
    'operation_id' | 'kept_user_id' | 'archived_user_id' | 'decision_type' | 'risk_score' | 'expires_at'
  > & {
    guest_state_snapshot?: unknown;
    google_state_snapshot?: unknown;
  },
): Promise<string | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('merge_receipts')
    .insert({
      ...values,
      guest_state_snapshot: (values.guest_state_snapshot ?? null) as never,
      google_state_snapshot: (values.google_state_snapshot ?? null) as never,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[merge] insertMergeReceipt failed:', error.message);
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
  const { error } = await supabase
    .from('merge_audit_log')
    .insert({
      ...values,
      guest_state_before: (values.guest_state_before ?? null) as never,
      google_state_before: (values.google_state_before ?? null) as never,
      guest_state_after: (values.guest_state_after ?? null) as never,
      google_state_after: (values.google_state_after ?? null) as never,
      merge_result: values.merge_result as never,
      preview_version: (values.preview_version ?? null) as never,
      risk_flags: (values.risk_flags ?? []) as never,
    } satisfies Partial<MergeAuditLogRow>);
  if (error) {
    console.error('[merge] insertMergeAuditLog failed:', error.message);
    return false;
  }
  return true;
}
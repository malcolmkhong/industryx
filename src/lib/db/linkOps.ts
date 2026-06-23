/**
 * linkOps — Centralized access to the `pending_link_operations` table.
 *
 * Iteration 9 of the Database Centralization migration.
 * Used by: /api/auth/link-identity (preview/insert), /api/auth/confirm-link
 * (fetch + mark completed/expired).
 *
 * Table purpose: orchestrates guest-to-OAuth merges. Each operation holds
 * previews, expires after 24h, and is closed with a merge_receipt + audit log.
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

type PendingLinkOpRow = Database['public']['Tables']['pending_link_operations']['Row'];

export type PendingLinkStatus = 'pending' | 'completed' | 'expired' | 'cancelled' | 'failed';

export interface PendingLinkOperation {
  id: string;
  guest_user_id: string;
  google_user_id: string | null;
  idempotency_key: string;
  status: string;
  ip_hash: string | null;
  ip_region: string | null;
  user_agent: string | null;
  risk_score: number | null;
  risk_flags: unknown;
  preference: string | null;
  preview_version: unknown;
  merge_result: unknown;
  confirmed_email: string | null;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
  fingerprint_hash?: string | null;
  device_id?: string | null;
}

export type PendingLinkInsert = Pick<
  PendingLinkOpRow,
  'guest_user_id' | 'idempotency_key' | 'expires_at'
> &
  Partial<
    Pick<
      PendingLinkOpRow,
      | 'google_user_id'
      | 'status'
      | 'ip_hash'
      | 'ip_region'
      | 'user_agent'
      | 'risk_score'
      | 'risk_flags'
      | 'preview_version'
      | 'fingerprint_hash'
      | 'device_id'
    >
  >;

const OPERATION_COLUMNS =
  'id, guest_user_id, google_user_id, idempotency_key, status, ip_hash, ip_region, user_agent, risk_score, risk_flags, preference, preview_version, merge_result, confirmed_email, expires_at, created_at, completed_at, fingerprint_hash, device_id';

/**
 * Find an operation by (idempotency_key, google_user_id). Used by
 * link-identity to short-circuit duplicate preview requests.
 */
export async function findLinkOperationByIdempotency(
  idempotencyKey: string,
  googleUserId: string,
): Promise<PendingLinkOperation | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pending_link_operations')
    .select(OPERATION_COLUMNS)
    .eq('idempotency_key', idempotencyKey)
    .eq('google_user_id', googleUserId)
    .maybeSingle();
  if (error) {
    console.error('[linkOps] findByIdempotency failed:', error.message);
    return null;
  }
  return (data ?? null) as PendingLinkOperation | null;
}

/**
 * Fetch an operation by id, scoped to google_user_id for auth boundary.
 * Used by confirm-link to resolve the operationId from the request.
 */
export async function findLinkOperationById(
  operationId: string,
  googleUserId: string,
  idempotencyKey: string,
): Promise<PendingLinkOperation | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pending_link_operations')
    .select(OPERATION_COLUMNS)
    .eq('id', operationId)
    .eq('google_user_id', googleUserId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) {
    console.error('[linkOps] findById failed:', error.message);
    return null;
  }
  return (data ?? null) as PendingLinkOperation | null;
}

/**
 * Find any pending operation for a google_user_id that is NOT the one
 * being confirmed. Used by confirm-link to enforce "one merge at a time".
 * Returns the first match, or null.
 */
export async function findOtherPendingForGoogle(
  googleUserId: string,
  excludeOperationId: string,
): Promise<{ id: string } | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pending_link_operations')
    .select('id')
    .eq('google_user_id', googleUserId)
    .eq('status', 'pending')
    .neq('id', excludeOperationId)
    .gt('expires_at', new Date().toISOString())
    .limit(1);
  if (error) {
    console.error('[linkOps] findOtherPending failed:', error.message);
    return null;
  }
  return (data && data.length > 0 ? data[0] : null) as { id: string } | null;
}

/**
 * Insert a new pending link operation. Returns the new id, or null.
 */
export async function insertLinkOperation(
  values: PendingLinkInsert,
): Promise<string | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pending_link_operations')
    .insert(values)
    .select('id')
    .single();
  if (error) {
    console.error('[linkOps] insert failed:', error.message);
    return null;
  }
  return (data?.id ?? null) as string | null;
}

/**
 * Update an operation's status (e.g., 'completed', 'expired').
 * Also stamps completed_at when transitioning to a terminal state.
 */
export async function setLinkOperationStatus(
  operationId: string,
  status: PendingLinkStatus,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const update: { status: string; completed_at?: string } = { status };
  if (status === 'completed' || status === 'expired' || status === 'cancelled' || status === 'failed') {
    update.completed_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from('pending_link_operations')
    .update(update)
    .eq('id', operationId);
  if (error) {
    console.error('[linkOps] setStatus failed:', error.message);
    return false;
  }
  return true;
}
/**
 * guestIdentities — Centralized access to the `guest_identities` table.
 *
 * Iteration 9 of the Database Centralization migration.
 * Migrated: /api/auth/recover-by-device, /api/auth/initialize-guest,
 * /api/auth/claim-guest, /api/auth/confirm-link, /api/auth/link-identity.
 *
 * Table purpose: device_id <-> user_id mapping for guest recovery.
 *   - `device_id` is the PRIMARY recovery signal.
 *   - `fingerprint_hash` is for analytics/correlation ONLY.
 *   - `is_primary` marks the active identity for a device.
 *   - `superseded_at` + `superseded_by` track the link-to-OAuth flow.
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

type GuestIdentityRow = Database['public']['Tables']['guest_identities']['Row'];

export interface GuestIdentity {
  id?: string;
  user_id: string;
  device_id: string;
  fingerprint_hash: string | null;
  is_primary: boolean;
  superseded_at: string | null;
  superseded_by: string | null;
  last_used_at?: string | null;
  created_at?: string;
}

/**
 * Find the primary identity for a device.
 * Returns null if the device has no primary identity.
 */
export async function findPrimaryIdentityByDevice(
  deviceId: string,
): Promise<GuestIdentity | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('guest_identities')
    .select('id, user_id, device_id, fingerprint_hash, is_primary, superseded_at, superseded_by, last_used_at, created_at')
    .eq('device_id', deviceId)
    .eq('is_primary', true)
    .maybeSingle();
  if (error) {
    console.error('[guestIdentities] findPrimaryIdentityByDevice failed:', error.message);
    return null;
  }
  return (data ?? null) as GuestIdentity | null;
}

/**
 * Find an identity by user_id (any is_primary value).
 * Used by merge flows that need all identities for a user.
 */
export async function findIdentitiesByUserId(
  userId: string,
): Promise<GuestIdentity[]> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('guest_identities')
    .select('id, user_id, device_id, fingerprint_hash, is_primary, superseded_at, superseded_by, last_used_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[guestIdentities] findIdentitiesByUserId failed:', error.message);
    return [];
  }
  return (data ?? []) as GuestIdentity[];
}

/**
 * Insert a new guest identity.
 * Used during initialize-guest and link flows.
 */
export async function insertGuestIdentity(
  values: Pick<GuestIdentityRow, 'user_id' | 'device_id' | 'fingerprint_hash' | 'is_primary'>,
): Promise<GuestIdentity | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('guest_identities')
    .insert(values)
    .select('id, user_id, device_id, fingerprint_hash, is_primary, superseded_at, superseded_by, last_used_at, created_at')
    .single();
  if (error) {
    console.error('[guestIdentities] insertGuestIdentity failed:', error.message);
    return null;
  }
  return data as GuestIdentity;
}

/**
 * Mark an identity as superseded by another user (OAuth link).
 * The "loser" identity points to the winner via superseded_by.
 */
export async function markIdentitySuperseded(
  identityId: string,
  supersededByUserId: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('guest_identities')
    .update({
      superseded_at: new Date().toISOString(),
      superseded_by: supersededByUserId,
      is_primary: false,
    })
    .eq('id', identityId);
  if (error) {
    console.error('[guestIdentities] markIdentitySuperseded failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Update last_used_at to "now" for a specific (user_id, device_id) pair.
 * Best-effort; failure does not propagate.
 */
export async function touchIdentityLastUsed(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('guest_identities')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('device_id', deviceId);
  if (error) {
    console.error('[guestIdentities] touchIdentityLastUsed failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Persist fingerprint_hash on a (user_id, device_id) row if not already set.
 * Best-effort: does not overwrite existing fingerprint.
 */
export async function setIdentityFingerprintIfMissing(
  userId: string,
  deviceId: string,
  fingerprintHash: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  // No .is() filter on Postgres (no null check) — Supabase will not match
  // null with =, so we issue an UPDATE with the is-still-null guard via
  // a subquery-like check. Simpler: try the update; if it errors on row
  // count, fall through.
  const { error } = await supabase
    .from('guest_identities')
    .update({ fingerprint_hash: fingerprintHash })
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .is('fingerprint_hash', null);
  if (error) {
    console.error('[guestIdentities] setIdentityFingerprintIfMissing failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Delete all identities for a user. Used by destructive ops (account reset).
 */
export async function deleteIdentitiesByUserId(userId: string): Promise<number> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('guest_identities')
    .delete()
    .eq('user_id', userId)
    .select('id');
  if (error) {
    console.error('[guestIdentities] deleteIdentitiesByUserId failed:', error.message);
    return 0;
  }
  return (data ?? []).length;
}

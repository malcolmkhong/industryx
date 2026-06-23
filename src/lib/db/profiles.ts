/**
 * profiles — Centralized access to the `profiles` table.
 *
 * Iteration 9 of the Database Centralization migration.
 * Migrated: /api/auth/update-profile, used by /api/auth/link-identity,
 * /api/auth/confirm-link (merge flow).
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export interface PublicProfile {
  id: string;
  display_name: string | null;
  is_guest: boolean;
  last_active: string | null;
  linked_account_id: string | null;
  linked_at: string | null;
  updated_at?: string | null;
}

/**
 * Update a user's display_name.
 * `displayName` may be null to clear the name.
 * Returns the updated row, or null if the user does not exist.
 */
export async function updateProfileDisplayName(
  userId: string,
  displayName: string | null,
): Promise<PublicProfile | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName } satisfies ProfileUpdate)
    .eq('id', userId)
    .select('id, display_name, is_guest, last_active, linked_account_id, linked_at, updated_at')
    .maybeSingle();
  if (error) {
    console.error('[profiles] updateDisplayName failed:', error.message);
    return null;
  }
  return (data ?? null) as PublicProfile | null;
}

/**
 * Get a profile by id.
 */
export async function getProfileById(userId: string): Promise<PublicProfile | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, is_guest, last_active, linked_account_id, linked_at, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[profiles] getProfileById failed:', error.message);
    return null;
  }
  return (data ?? null) as PublicProfile | null;
}

/**
 * Upsert a profile (used during initial guest creation, link flows).
 */
export async function upsertProfile(
  userId: string,
  values: Partial<Pick<ProfileRow, 'display_name' | 'device_fingerprint' | 'is_guest'>>,
): Promise<PublicProfile | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...values } satisfies Partial<ProfileRow>)
    .select('id, display_name, is_guest, last_active, linked_account_id, linked_at, updated_at')
    .maybeSingle();
  if (error) {
    console.error('[profiles] upsertProfile failed:', error.message);
    return null;
  }
  return (data ?? null) as PublicProfile | null;
}

/**
 * Mark a profile as a guest (is_guest = true).
 * Used by claim-guest after a new anon user takes over an old device.
 * Best-effort: failure is logged but not propagated (the route tolerates
 * a stale is_guest flag — recover-by-device is the source of truth).
 */
export async function markProfileAsGuest(userId: string): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ is_guest: true } satisfies ProfileUpdate)
    .eq('id', userId);
  if (error) {
    console.error('[profiles] markProfileAsGuest failed:', error.message);
    return false;
  }
  return true;
}

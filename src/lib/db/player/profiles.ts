/**
 * profiles — Centralized access to the `profiles` table.
 *
 * Iteration 9 of the Database Centralization migration.
 * Migrated: /api/auth/profile/update, used by /api/auth/identity/link,
 * /api/auth/identity/confirm-link (merge flow).
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 */
import { getDbClient } from '@/lib/db/access';
import type { Database } from "@/lib/db/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

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
  const supabase = await getDbClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName } satisfies ProfileUpdate)
    .eq("id", userId)
    .select(
      "id, display_name, is_guest, last_active, linked_account_id, linked_at, updated_at",
    )
    .maybeSingle();
  if (error) {
    console.error("[profiles] updateDisplayName failed:", error.message);
    return null;
  }
  return (data ?? null) as PublicProfile | null;
}

/**
 * Get a profile by id.
 */
export async function getProfileById(
  userId: string,
): Promise<PublicProfile | null> {
  const supabase = await getDbClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, is_guest, last_active, linked_account_id, linked_at, updated_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[profiles] getProfileById failed:", error.message);
    return null;
  }
  return (data ?? null) as PublicProfile | null;
}

/**
 * Upsert a profile (used during initial guest creation, link flows).
 */
export async function upsertProfile(
  userId: string,
  values: Partial<
    Pick<ProfileRow, "display_name" | "device_fingerprint" | "is_guest">
  >,
): Promise<PublicProfile | null> {
  const supabase = await getDbClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...values } satisfies Partial<ProfileRow>)
    .select(
      "id, display_name, is_guest, last_active, linked_account_id, linked_at, updated_at",
    )
    .maybeSingle();
  if (error) {
    console.error("[profiles] upsertProfile failed:", error.message);
    return null;
  }
  return (data ?? null) as PublicProfile | null;
}

/**
 * Mark a profile as a guest (is_guest = true).
 * Used by /api/auth/guest/quickstart after a device fingerprint resolves
 * to an existing anon user. Best-effort: failure is logged but not
 * propagated (quickstart tolerates a stale is_guest flag; the next
 * /api/game/state/sync call will re-derive from profiles.is_anonymous).
 */
export async function markProfileAsGuest(userId: string): Promise<boolean> {
  const supabase = await getDbClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("profiles")
    .update({ is_guest: true } satisfies ProfileUpdate)
    .eq("id", userId);
  if (error) {
    console.error("[profiles] markProfileAsGuest failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Set profiles.device_fingerprint for the current device session.
 * Called by /api/auth/device/register after a successful OAuth login,
 * keeping the user's "current device" pointer on the canonical row.
 *
 * Only writes when given a non-empty fingerprint. Empty / null / undefined
 * is a no-op (we never overwrite a real fingerprint with an empty one).
 *
 * Returns true on success, false on error or no-op.
 */
export async function setProfileFingerprint(
  userId: string,
  fingerprint: string | null | undefined,
): Promise<boolean> {
  if (!fingerprint) return false;
  const supabase = await getDbClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from("profiles")
    .update({ device_fingerprint: fingerprint } satisfies ProfileUpdate)
    .eq("id", userId);
  if (error) {
    console.error("[profiles] setProfileFingerprint failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Read the display name + guest flag for one user. Used by
 * /api/auth/identity/link to build the merge preview.
 * Returns null if the user has no profile row.
 */
export async function getProfileDisplayAndGuestFlag(
  userId: string,
): Promise<{ display_name: string | null; is_guest: boolean } | null> {
  const supabase = await getDbClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, is_guest")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[profiles] getDisplayAndGuestFlag failed:", error.message);
    return null;
  }
  return (data ?? null) as {
    display_name: string | null;
    is_guest: boolean;
  } | null;
}

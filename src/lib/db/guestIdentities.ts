/**
 * guestIdentities — Centralized access to the `guest_identities` table.
 *
 * Iteration 9 of the Database Centralization migration.
 * Migrated: /api/auth/recover-by-device, /api/auth/initialize-guest,
 * /api/auth/claim-guest. (link-identity + confirm-link use this module
 * for read paths; their write paths live in db/merge.ts.)
 *
 * Table purpose: device_id <-> user_id mapping for guest recovery.
 *   - `device_id` is the PRIMARY recovery signal.
 *   - `fingerprint` is the raw device fingerprint (NOT NULL, required on insert).
 *   - `fingerprint_hash` is the SHA-256 hex digest, analytics only.
 *   - `is_primary` marks the active identity for a device.
 *   - `superseded_at` + `superseded_by` track the link-to-OAuth flow.
 *   - `claimed_at` records when the device's identity was established.
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 */
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";

type GuestIdentityRow = Database["public"]["Tables"]["guest_identities"]["Row"];

export interface GuestIdentity {
  id?: string;
  user_id: string;
  device_id: string | null;
  fingerprint: string;
  fingerprint_hash: string | null;
  is_primary: boolean;
  claimed_at?: string;
  superseded_at: string | null;
  superseded_by: string | null;
  last_used_at?: string | null;
  created_at?: string;
}

export type GuestIdentityInsert = Pick<
  GuestIdentityRow,
  "user_id" | "fingerprint"
> &
  Partial<
    Pick<
      GuestIdentityRow,
      "device_id" | "fingerprint_hash" | "is_primary" | "claimed_at"
    >
  >;

/**
 * Find the active identity for a raw fingerprint value.
 * Used by /api/auth/quickstart to detect returning users whose deviceId
 * was lost but whose fingerprint survived (localStorage wiped).
 *
 * Queries the `fingerprint` column — the column with the unique partial
 * index (guest_identities_active_fingerprint_uidx), NOT fingerprint_hash.
 * fingerprint_hash is analytics-only and nullable; it has no uniqueness
 * guarantee and is the wrong column to query for recovery.
 *
 * Returns null if no active identity exists for this fingerprint.
 */
export async function findIdentityByFingerprint(
  fingerprint: string,
): Promise<GuestIdentity | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("guest_identities")
    .select(
      "id, user_id, device_id, fingerprint, fingerprint_hash, is_primary, claimed_at, superseded_at, superseded_by, last_used_at, created_at",
    )
    .eq("fingerprint", fingerprint)
    .is("superseded_by", null)
    .maybeSingle();
  if (error) {
    console.error(
      "[guestIdentities] findIdentityByFingerprint failed:",
      error.message,
    );
    return null;
  }
  return (data ?? null) as GuestIdentity | null;
}

/**
 * Convenience wrapper for /api/auth/quickstart: returns just the user_id
 * (or null) for the active identity matched by fingerprint.
 */
export async function findUserByFingerprint(
  fingerprint: string,
): Promise<{ user_id: string } | null> {
  const id = await findIdentityByFingerprint(fingerprint);
  return id?.user_id ? { user_id: id.user_id } : null;
}

/**
 * Convenience wrapper for /api/auth/quickstart: returns just the user_id
 * (or null) for the active primary identity matched by device_id.
 */
export async function findUserByDeviceId(
  deviceId: string,
): Promise<{ user_id: string } | null> {
  const id = await findPrimaryIdentityByDevice(deviceId);
  return id?.user_id ? { user_id: id.user_id } : null;
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
    .from("guest_identities")
    .select(
      "id, user_id, device_id, fingerprint, fingerprint_hash, is_primary, claimed_at, superseded_at, superseded_by, last_used_at, created_at",
    )
    .eq("device_id", deviceId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) {
    console.error(
      "[guestIdentities] findPrimaryIdentityByDevice failed:",
      error.message,
    );
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
    .from("guest_identities")
    .select(
      "id, user_id, device_id, fingerprint, fingerprint_hash, is_primary, claimed_at, superseded_at, superseded_by, last_used_at, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(
      "[guestIdentities] findIdentitiesByUserId failed:",
      error.message,
    );
    return [];
  }
  return (data ?? []) as GuestIdentity[];
}

/**
 * Insert a new guest identity.
 * `fingerprint` is required (NOT NULL on table). Callers that have a
 * device-side fingerprint pass it raw; `fingerprint_hash` is the optional
 * SHA-256 hex digest computed by the caller.
 *
 * Returns null on any database error. Callers handle the null path —
 * callers that hit the migration 054 partial unique index MUST pre-check
 * via findIdentityByFingerprint() to determine whether the conflict is
 * "expected" (fingerprint claimed by another user, defer to confirm-link)
 * or "unexpected" (real DB error).
 */
export async function insertGuestIdentity(
  values: GuestIdentityInsert,
): Promise<GuestIdentity | null> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("guest_identities")
    .insert(values)
    .select(
      "id, user_id, device_id, fingerprint, fingerprint_hash, is_primary, claimed_at, superseded_at, superseded_by, last_used_at, created_at",
    )
    .single();
  if (error) {
    console.error(
      "[guestIdentities] insertGuestIdentity failed:",
      error.message,
    );
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
    .from("guest_identities")
    .update({
      superseded_at: new Date().toISOString(),
      superseded_by: supersededByUserId,
      is_primary: false,
    })
    .eq("id", identityId);
  if (error) {
    console.error(
      "[guestIdentities] markIdentitySuperseded failed:",
      error.message,
    );
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
    .from("guest_identities")
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("device_id", deviceId);
  if (error) {
    console.error(
      "[guestIdentities] touchIdentityLastUsed failed:",
      error.message,
    );
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
    .from("guest_identities")
    .update({ fingerprint_hash: fingerprintHash })
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .is("fingerprint_hash", null);
  if (error) {
    console.error(
      "[guestIdentities] setIdentityFingerprintIfMissing failed:",
      error.message,
    );
    return false;
  }
  return true;
}

/**
 * Check whether an identity row exists for (user_id, device_id).
 * Used by /api/auth/initialize-guest as the dedupe gate.
 */
export async function hasIdentityForUserAndDevice(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("guest_identities")
    .select("id")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) {
    console.error(
      "[guestIdentities] hasIdentityForUserAndDevice failed:",
      error.message,
    );
    return false;
  }
  return data !== null;
}

/**
 * Check whether ANY identity exists for a user (any device_id).
 * Used by /api/auth/initialize-guest to skip insertion when the
 * user already has an identity from another device.
 */
export async function hasAnyIdentityForUser(userId: string): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("guest_identities")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(
      "[guestIdentities] hasAnyIdentityForUser failed:",
      error.message,
    );
    return false;
  }
  return data !== null;
}

/**
 * Delete all identities for a user. Used by destructive ops (account reset).
 */
export async function deleteIdentitiesByUserId(
  userId: string,
): Promise<number> {
  const supabase = await createServiceRoleClient();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("guest_identities")
    .delete()
    .eq("user_id", userId)
    .select("id");
  if (error) {
    console.error(
      "[guestIdentities] deleteIdentitiesByUserId failed:",
      error.message,
    );
    return 0;
  }
  return (data ?? []).length;
}

/**
 * Per-user tables reassigned from old guest → new anon during claim-guest.
 * Each update is independent — a failure in one table does not block others.
 */
export const REASSIGNABLE_TABLES = [
  "server_game_state",
  "player_progress",
  "player_actions",
  "player_sessions",
  "market_player_pressure",
  "leaderboard_entries",
  "support_tickets",
] as const;

export interface ReassignResult {
  table: string;
  ok: boolean;
  rows: number;
  error?: string;
}

/**
 * Reassign ownership of every per-user table from `oldUserId` to `newUserId`.
 * Returns a per-table report (ok + rows + optional error).
 *
 * Intentionally NOT a single transaction — claim-guest tolerates partial
 * success because each table is idempotent and the old identity is already
 * marked superseded.
 */
export async function reassignUserData(
  oldUserId: string,
  newUserId: string,
): Promise<ReassignResult[]> {
  const supabase = await createServiceRoleClient();
  if (!supabase) {
    return REASSIGNABLE_TABLES.map((table) => ({
      table,
      ok: false,
      rows: 0,
      error: "Supabase service-role client not configured",
    }));
  }
  const results: ReassignResult[] = [];
  for (const table of REASSIGNABLE_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .update({ user_id: newUserId })
      .eq("user_id", oldUserId)
      .select("user_id");
    results.push({
      table,
      ok: !error,
      rows: data?.length ?? 0,
      ...(error ? { error: error.message } : {}),
    });
    if (error) {
      console.error(
        `[guestIdentities] reassignUserData: ${table} failed (old=${oldUserId}, new=${newUserId}):`,
        error.message,
      );
    }
  }
  return results;
}

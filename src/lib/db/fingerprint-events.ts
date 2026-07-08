/**
 * fingerprintEvents — Centralized access to `fingerprint_events` (migration 065).
 *
 * Append-only event log for fingerprint outcomes. Used for:
 *   - Server-side telemetry (which browsers / extensions cause failures)
 *   - Admin analytics (how many users are affected)
 *   - Trend detection (failures spiking after SDK updates)
 *
 * All writes go through the service role (RLS blocks client access by design).
 * Best-effort: failure must not block the request that triggered the event.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FingerprintReason =
  | "blocked"
  | "timeout"
  | "network"
  | "unsupported"
  | "unknown";

export interface FingerprintEventInsert {
  user_id: string;
  status: "available" | "unavailable";
  reason: FingerprintReason;
  user_agent?: string | null;
  platform?: string | null;
}

/**
 * Insert one fingerprint outcome row. Best-effort: returns true on success
 * or false on any error, never throws (caller does not block on failure).
 */
export async function logFingerprintEvent(
  supabase: SupabaseClient,
  event: FingerprintEventInsert,
): Promise<boolean> {
  const { error } = await supabase.from("fingerprint_events").insert({
    user_id: event.user_id,
    status: event.status,
    reason: event.reason,
    user_agent: event.user_agent ?? null,
    platform: event.platform ?? null,
  });
  if (error) {
    console.warn(
      "[fingerprintEvents] insert failed:",
      error.message,
    );
    return false;
  }
  return true;
}

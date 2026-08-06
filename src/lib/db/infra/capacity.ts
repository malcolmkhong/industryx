// ============================================================================
// src/lib/db/capacity.ts
// Capacity-status RPC wrapper for the `get_capacity_status` function.
//
// Returns the typed CapacityInfo row, or null if the RPC failed / DB is
// unreachable. The caller (src/lib/capacity.ts) decides the fallback.
// ============================================================================

import { getDbClient } from "@/lib/db/access";

export type CapacityStatus = "healthy" | "warning" | "full";

export interface CapacityInfoRow {
  max_total_players: number | string;
  total_players: number | string;
  registered_users: number | string;
  guest_users: number | string;
  waitlist_count: number | string;
  utilization_pct: number | string;
  status: CapacityStatus;
  active_15m: number | string;
  active_24h: number | string;
  active_7d: number | string;
}

/**
 * Calls the `get_capacity_status` RPC.
 * Returns the first row (typed), or null if the RPC failed or returned no rows.
 */
export async function getCapacityStatusRpc(): Promise<CapacityInfoRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_capacity_status");
  if (error || !data?.[0]) return null;
  return data[0] as CapacityInfoRow;
}

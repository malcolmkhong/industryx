/**
 * infra.ts — Database infrastructure helpers (server info queries).
 *
 * Iteration 8. Read-only queries about the database itself (size, version).
 * Used by /api/admin/system/monitoring for the infra dashboard.
 */

import { createServiceRoleClient } from './admin';

/**
 * Returns the PostgreSQL database size in megabytes (rounded to 2 decimals).
 * Falls back to 0 on any error (caller treats 0 as "unknown").
 */
export async function getDatabaseSizeMb(): Promise<number> {
  const supabase = createServiceRoleClient();
  if (!supabase) return 0;
  try {
    // pg_database_size returns a bigint, REST surfaces it as a string.
    // Cast through unknown because RPC name is dynamic.
    const { data, error } = await supabase.rpc('pg_database_size' as never);
    if (error || data == null) return 0;
    const bytes = typeof data === 'string' ? Number(data) : Number(data);
    if (!Number.isFinite(bytes) || bytes <= 0) return 0;
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
  } catch {
    return 0;
  }
}
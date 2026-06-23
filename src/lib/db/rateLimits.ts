// ============================================================================
// src/lib/db/rateLimits.ts
// Supabase-backed rate limit check (H2 fix).
//
// Wraps the `check_rate_limit` RPC. Returns null if the call succeeded and
// `null` if not configured; otherwise returns the raw RPC result row.
// ============================================================================

import { createServiceRoleClient } from '@/lib/db/admin';

export interface CheckRateLimitRow {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  reset_at: string;
}

/**
 * Calls the `check_rate_limit` RPC. Returns the first row of the result
 * set, or null if the call failed / DB unreachable.
 */
export async function checkRateLimitRpc(params: {
  identifier: string;
  endpoint: string;
  windowSeconds: number;
  maxRequests: number;
}): Promise<CheckRateLimitRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_identifier: params.identifier,
    p_endpoint: params.endpoint,
    p_window_seconds: params.windowSeconds,
    p_max_requests: params.maxRequests,
  });

  if (error) return null;

  const result = (data as CheckRateLimitRow[] | null)?.[0];
  return result ?? null;
}

// src/lib/capacity.ts
// Capacity check helpers — server-authoritative, uses get_capacity_status() RPC.
// MAX_TOTAL_PLAYERS is stored in app_config table (configurable from admin).
//
// IMPORTANT: Do NOT use active/online/session metrics for capacity enforcement.
// Idle games have offline players who still consume resources.

import { createServiceRoleClient } from '@/lib/supabase/server';

export type CapacityStatus = 'healthy' | 'warning' | 'full';

export interface CapacityInfo {
  max: number;
  total: number;
  registered: number;
  guests: number;
  waitlistCount: number;
  utilizationPct: number;
  status: CapacityStatus;
  // Activity metrics (analytics only — DO NOT use for enforcement)
  active15m: number;
  active24h: number;
  active7d: number;
}

const DEFAULT_MAX = 500;
const FALLBACK: CapacityInfo = {
  max: DEFAULT_MAX,
  total: 0,
  registered: 0,
  guests: 0,
  waitlistCount: 0,
  utilizationPct: 0,
  status: 'healthy',
  active15m: 0,
  active24h: 0,
  active7d: 0,
};

/**
 * Server-side. Returns full capacity info from get_capacity_status() RPC.
 * Use this in API routes (server components, route handlers).
 */
export async function getCapacityStatus(): Promise<CapacityInfo> {
  const supabase = createServiceRoleClient();
  if (!supabase) return FALLBACK;
  const { data, error } = await supabase.rpc('get_capacity_status');
  if (error || !data?.[0]) return FALLBACK;
  const row = data[0];
  return {
    max: Number(row.max_total_players),
    total: Number(row.total_players),
    registered: Number(row.registered_users),
    guests: Number(row.guest_users),
    waitlistCount: Number(row.waitlist_count),
    utilizationPct: Number(row.utilization_pct),
    status: row.status as CapacityStatus,
    active15m: Number(row.active_15m),
    active24h: Number(row.active_24h),
    active7d: Number(row.active_7d),
  };
}

/**
 * Server-side helper. Returns true if a new signup would be allowed.
 * Used by API routes to gate signup-check.
 */
export async function canAcceptNewSignup(): Promise<boolean> {
  const cap = await getCapacityStatus();
  return cap.status !== 'full';
}

/**
 * Client-side: fetches capacity via the public /api/capacity endpoint.
 * For UI hints only — never authoritative.
 */
export async function getCapacityForClient(): Promise<CapacityInfo> {
  if (typeof window === 'undefined') return FALLBACK;
  try {
    const res = await fetch('/api/capacity', { cache: 'no-store' });
    if (!res.ok) return FALLBACK;
    return (await res.json()) as CapacityInfo;
  } catch {
    return FALLBACK;
  }
}

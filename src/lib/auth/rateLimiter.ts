// ============================================
// IndustriaX: Supabase-Backed Rate Limiter (H2)
// Distributed, persistent rate limiting across multi-instance deployments
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  /**
   * If true, return 503 when the rate-limit check fails (DB unreachable).
   * Use for security-critical endpoints (trade, state, action).
   * If false, fail-open (best-effort, allow the request).
   */
  failClosed: boolean;
}

// Pre-configured rate limit profiles
export const RATE_LIMITS = {
  /** Player save/load: 20/min, best-effort */
  player: { maxRequests: 20, windowMs: 60_000, failClosed: false },
  /** Game compute (compute, offline): 10/min, best-effort */
  compute: { maxRequests: 10, windowMs: 60_000, failClosed: false },
  /** Game action validation (action, trade): 30/min, fail-closed (security) */
  action: { maxRequests: 30, windowMs: 60_000, failClosed: true },
  /** Game state sync: 30/min, fail-closed (cheat prevention) */
  sync: { maxRequests: 30, windowMs: 60_000, failClosed: true },
  /** Config/definitions: 30/min, best-effort */
  config: { maxRequests: 30, windowMs: 60_000, failClosed: false },
  /** General API (heartbeat): 60/min, best-effort */
  general: { maxRequests: 60, windowMs: 60_000, failClosed: false },
} as const;

interface CheckRateLimitRow {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  reset_at: string;
}

/**
 * Check if a request should be rate-limited.
 * Returns null if allowed, or a NextResponse with 429 (or 503 on DB error for fail-closed) if blocked.
 *
 * H2 FIX: Backed by Supabase `check_rate_limit` RPC. Works across multi-instance
 * deployments, survives restarts, ~5-10ms latency per check. Falls back to
 * fail-open (or 503 for fail-closed) if the DB is unreachable.
 *
 * @param identifier - Usually the userId or IP address
 * @param config - Rate limit configuration (with failClosed flag)
 * @param endpoint - Endpoint name for logging (also used as the bucket key)
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  endpoint: string,
): Promise<NextResponse | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    console.warn(`[RateLimit] ${endpoint}: service role not configured, ${config.failClosed ? 'blocking' : 'allowing'}`);
    return config.failClosed
      ? serviceUnavailableResponse()
      : null;
  }

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_window_seconds: Math.floor(config.windowMs / 1000),
      p_max_requests: config.maxRequests,
    });

    if (error) {
      console.warn(`[RateLimit] ${endpoint}: RPC error: ${error.message}`);
      return config.failClosed ? serviceUnavailableResponse() : null;
    }

    const result = (data as CheckRateLimitRow[] | null)?.[0];
    if (!result) {
      console.warn(`[RateLimit] ${endpoint}: empty RPC result`);
      return config.failClosed ? serviceUnavailableResponse() : null;
    }

    if (!result.allowed) {
      const resetMs = new Date(result.reset_at).getTime();
      const retryAfterMs = Math.max(0, resetMs - Date.now());
      console.warn(
        `[RateLimit] ${endpoint}: User ${identifier} exceeded ${config.maxRequests} requests/${config.windowMs / 1000}s (count: ${result.current_count})`
      );

      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please slow down.',
          code: 'RATE_LIMITED',
          retryAfterMs,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(resetMs / 1000)),
          },
        },
      );
    }

    return null;
  } catch (err) {
    console.error(`[RateLimit] ${endpoint}: unexpected error:`, err);
    return config.failClosed ? serviceUnavailableResponse() : null;
  }
}

function serviceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Service temporarily unavailable', code: 'RATE_LIMIT_CHECK_FAILED' },
    { status: 503 },
  );
}

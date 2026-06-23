// ============================================
// IndustriaX: Supabase-Backed Rate Limiter (H2)
// Distributed, persistent rate limiting across multi-instance deployments
// ============================================

import { NextResponse } from 'next/server';
import { checkRateLimitRpc } from '@/lib/db/rateLimits';

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
// 2026-06-19 tuning for 500 players on Supabase free tier:
// - Tighter action/sync limits (cheat prevention + 33% less rate_limits row growth)
// - Lower general/admin limits (no need for high caps)
// - See planning estimate: ~134 MB/day at 670k requests/day, well under 500MB cap
//   with 15-min cleanup keeping table at ~2.3k rows.
export const RATE_LIMITS = {
  /** Player save/load: 20/min, best-effort */
  player: { maxRequests: 20, windowMs: 60_000, failClosed: false },
  /** Game compute (compute, offline): 10/min, best-effort */
  compute: { maxRequests: 10, windowMs: 60_000, failClosed: false },
  /** Game action validation (action, trade): 20/min, fail-closed (cheat prevention) */
  action: { maxRequests: 20, windowMs: 60_000, failClosed: true },
  /** Game state sync: 20/min, fail-closed (cheat prevention) */
  sync: { maxRequests: 20, windowMs: 60_000, failClosed: true },
  /** Config/definitions: 30/min, best-effort */
  config: { maxRequests: 30, windowMs: 60_000, failClosed: false },
  /** General fallback: 30/min, best-effort */
  general: { maxRequests: 30, windowMs: 60_000, failClosed: false },
  /** Admin endpoints: 60/min, best-effort */
  admin: { maxRequests: 60, windowMs: 60_000, failClosed: false },
} as const;

/**
 * Check if a request should be rate-limited.
 * Returns null if allowed, or a NextResponse with 429 (or 503 on DB error for fail-closed) if blocked.
 *
 * H2 FIX: Backed by Supabase `check_rate_limit` RPC. Works across multi-instance
 * deployments, survives restarts, ~5-10ms latency per check. Falls back to
 * fail-open (or 503 for fail-closed) if the DB is unreachable.
 *
 * Iteration 10: the underlying RPC call is now delegated to
 * src/lib/db/rateLimits.ts#checkRateLimitRpc.
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
  try {
    const result = await checkRateLimitRpc({
      identifier,
      endpoint,
      windowSeconds: Math.floor(config.windowMs / 1000),
      maxRequests: config.maxRequests,
    });

    if (!result) {
      console.warn(`[RateLimit] ${endpoint}: RPC unavailable or empty result`);
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

// ============================================
// IndustriaX: In-Memory Rate Limiter
// Per-user request rate limiting for API routes
// ============================================

import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Map of identifier -> rate limit entry
const rateLimitMap = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

// Pre-configured rate limit profiles
export const RATE_LIMITS = {
  /** Player save/load: 20 requests per minute */
  player: { maxRequests: 20, windowMs: 60_000 },
  /** Game compute: 10 requests per minute (expensive) */
  compute: { maxRequests: 10, windowMs: 60_000 },
  /** Game action validation: 30 requests per minute */
  action: { maxRequests: 30, windowMs: 60_000 },
  /** Config/definitions: 30 requests per minute */
  config: { maxRequests: 30, windowMs: 60_000 },
  /** General API: 60 requests per minute */
  general: { maxRequests: 60, windowMs: 60_000 },
} as const;

/**
 * Check if a request should be rate-limited.
 * Returns null if allowed, or a NextResponse with 429 if blocked.
 *
 * @param identifier - Usually the userId or IP address
 * @param config - Rate limit configuration
 * @param endpoint - Endpoint name for logging
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  endpoint: string,
): NextResponse | null {
  const now = Date.now();

  let entry = rateLimitMap.get(identifier);

  // Create or reset entry if window expired
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitMap.set(identifier, entry);
    return null; // First request in window, allow
  }

  // Increment count
  entry.count += 1;

  if (entry.count > config.maxRequests) {
    const retryAfterMs = entry.resetAt - now;
    console.warn(
      `[RateLimit] ${endpoint}: User ${identifier} exceeded ${config.maxRequests} requests/${config.windowMs / 1000}s (count: ${entry.count})`
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
          'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
        },
      },
    );
  }

  return null; // Within limits, allow
}

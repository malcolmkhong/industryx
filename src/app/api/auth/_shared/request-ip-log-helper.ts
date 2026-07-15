// Request IP Log Helper
// Server-side helper: read x-real-ip header, hash it, write to request_ip_log
// Phase 1 - Foundation (Storage + Audit)
//
// This helper is for ANALYTICS ONLY. IP is NEVER used for bans or locks.
// The IP is hashed before storage (SHA-256). The raw IP is never persisted.

import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/db/access';;

export interface RequestIpLogEntry {
  endpoint: string;
  ipHash: string;
  userId?: string | null;
}

const ENDPOINTS_TO_LOG = new Set<string>([
  '/api/auth/identity/link',
  '/api/auth/identity/confirm-link',
  '/api/auth/identity/link',
  '/api/auth/identity/confirm-link',
]);

/**
 * Hash the IP using SHA-256. The raw IP is never stored.
 */
export function hashIp(ip: string): string {
  if (!ip || ip === 'unknown') {
    return 'unknown';
  }
  return createHash('sha256').update(ip).digest('hex');
}

/**
 * Extract the real client IP from request headers.
 * Tries cf-connecting-ip first (Cloudflare), then x-real-ip (Vercel), then x-forwarded-for.
 * Returns 'unknown' if no IP is found.
 */
export function extractClientIp(headers: Headers): string {
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // First entry is the original client
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }
  return 'unknown';
}

/**
 * Log a request's IP to request_ip_log. Fire-and-forget (does not block the response).
 * Silently fails if the table does not exist (e.g., migration 047 not yet applied).
 */
export async function logRequestIp(
  request: Request,
  endpoint: string,
  userId?: string | null,
): Promise<void> {
  if (!ENDPOINTS_TO_LOG.has(endpoint)) {
    return;
  }
  const ip = extractClientIp(request.headers);
  const ipHash = hashIp(ip);
  const entry: RequestIpLogEntry = { endpoint, ipHash, userId: userId ?? null };
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      // No service role; skip silently
      console.warn('[RequestIpLog] No service role client; skipping log for', endpoint);
      return;
    }
    const { error } = await supabase.from('request_ip_log').insert({
      endpoint: entry.endpoint,
      ip_hash: entry.ipHash,
      user_id: entry.userId,
    });
    if (error) {
      console.warn('[RequestIpLog] Insert error for', endpoint, ':', error.message);
    } else {
      console.info('[RequestIpLog] Logged', endpoint, 'ip_hash=', ipHash.slice(0, 12), 'user_id=', userId ?? 'null');
    }
  } catch (err) {
    // Silently fail. This is analytics; never block the response.
    console.warn('[RequestIpLog] Failed to log IP:', err instanceof Error ? err.message : 'unknown error');
  }
}

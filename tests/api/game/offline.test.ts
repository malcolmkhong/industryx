/**
 * tests/api/game/state/offline-progress.test.ts
 *
 * Boundary + auth tests for POST /api/game/state/offline-progress.
 * (GET was removed 2026-07-09 — see commit removing dead code; the offline
 * tick flow is fully driven by POST.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    serverTick: { maxRequests: 12, windowMs: 60_000, failClosed: true },
    action: { limit: 100, windowMs: 60000 },
    general: { limit: 200, windowMs: 60000 },
  },
}));
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { POST } from '@/app/api/game/state/offline-progress/route';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';

describe('POST /api/game/state/offline-progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({ method: 'POST', url: '/api/game/state/offline-progress', body: {} });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('uses serverTick rate limit profile for authoritative offline settlement', async () => {
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const req = buildRequest({ method: 'POST', url: '/api/game/state/offline-progress', body: {} });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      'user-1',
      RATE_LIMITS.serverTick,
      '/api/game/state/offline-progress',
    );
  });
});

/**
 * tests/api/game/production/compute.test.ts
 *
 * Boundary + auth tests for POST /api/game/production/compute.
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

import { POST } from '@/app/api/game/production/compute/route';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';

describe('POST /api/game/production/compute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when userId does not match authenticated user', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/production/compute',
      body: { userId: 'different-user', ticks: 10, gameState: {} },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(checkRateLimit).toHaveBeenCalledWith(
      'user-1',
      RATE_LIMITS.serverTick,
      '/api/game/production/compute',
    );
  });

  it('returns 400 when ticks is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/production/compute',
      body: { userId: 'user-1', gameState: {} },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/production/compute',
      body: { userId: 'user-1', ticks: 10, gameState: {} },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });
});

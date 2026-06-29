/**
 * tests/api/game/action.test.ts
 *
 * Boundary + auth tests for POST /api/game/action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { action: { limit: 100, windowMs: 60000 }, general: { limit: 200, windowMs: 60000 } },
}));
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { POST } from '@/app/api/game/action/route';

describe('POST /api/game/action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when action is missing from payload', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/action',
      body: { userId: 'user-1', payload: {}, gameState: {} },
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
      url: '/api/game/action',
      body: { userId: 'user-1', action: 'build', payload: {}, gameState: {} },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });
});

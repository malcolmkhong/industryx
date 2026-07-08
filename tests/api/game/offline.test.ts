/**
 * tests/api/game/offline.test.ts
 *
 * Boundary + auth tests for GET/POST /api/game/offline.
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

import { GET, POST } from '@/app/api/game/offline/route';

describe('GET /api/game/offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({ method: 'GET', url: '/api/game/offline' });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/game/offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({ method: 'POST', url: '/api/game/offline', body: {} });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });
});

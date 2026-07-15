/**
 * tests/api/player/profile.test.ts
 *
 * Boundary + auth tests for GET /api/player/profile.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
  verifyAuthAndOwnership: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { GET } from '@/app/api/player/profile/route';

describe('GET /api/player/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when userId is missing', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/player/profile' });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/userId/i);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuthAndOwnership } = await import('@/lib/auth/verifyAuth');
    (verifyAuthAndOwnership as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({ method: 'GET', url: '/api/player/profile?userId=user-1' });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 503 when DB is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/access', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/player/profile/route');
    const req = buildRequest({ method: 'GET', url: '/api/player/profile?userId=user-1' });
    const res = await fresh.GET(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

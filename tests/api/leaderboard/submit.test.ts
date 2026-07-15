/**
 * tests/api/game/leaderboard/submit.test.ts
 *
 * Boundary + auth tests for POST /api/game/leaderboard/submit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/guestCheck', () => ({
  getUserGuestStatus: vi.fn().mockResolvedValue({ isGuest: false }),
}));

import { POST } from '@/app/api/game/leaderboard/submit/route';

describe('POST /api/game/leaderboard/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when authorization header is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/leaderboard/submit',
      body: { score: 1000 },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/authentication/i);
  });

  it('returns 401 when token is invalid', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/access', () => ({
      createServiceRoleClient: () => ({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('invalid_token') }),
        },
      }),
      createClient: async () => null,
      isServiceRoleConfigured: () => true,
      isSupabaseConfigured: () => true,
    }));
    const fresh = await import('@/app/api/game/leaderboard/submit/route');
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/leaderboard/submit',
      headers: { authorization: 'Bearer invalid-token' },
      body: { score: 1000 },
    });
    const res = await fresh.POST(req);
    expect(res.status).toBe(401);
    vi.doUnmock('@/lib/supabase/server');
  });

  it('returns 503 when database is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/access', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/game/leaderboard/submit/route');
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/leaderboard/submit',
      headers: { authorization: 'Bearer valid-token' },
      body: { score: 1000 },
    });
    const res = await fresh.POST(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

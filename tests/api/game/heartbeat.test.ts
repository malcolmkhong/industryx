/**
 * tests/api/game/session/heartbeat.test.ts
 *
 * Boundary + auth tests for POST /api/game/session/heartbeat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { action: { limit: 100, windowMs: 60000 }, general: { limit: 200, windowMs: 60000 } },
}));
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { POST } from '@/app/api/game/session/heartbeat/route';

describe('POST /api/game/session/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/session/heartbeat',
      body: undefined,
    });
    // Override to send invalid body by using text
    const { NextRequest } = await import('next/server');
    const badReq = new NextRequest('http://localhost:3000/api/game/session/heartbeat', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/JSON/i);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/session/heartbeat',
      body: { gameTick: 100, money: 1000, paused: false, gameSpeed: 1 },
    });
    const res = await POST(req);
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
    const fresh = await import('@/app/api/game/session/heartbeat/route');
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/session/heartbeat',
      body: { gameTick: 100, money: 1000, paused: false, gameSpeed: 1 },
    });
    const res = await fresh.POST(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

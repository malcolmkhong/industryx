/**
 * tests/api/auth/migrate-guest.test.ts
 *
 * Boundary + auth tests for POST /api/auth/migrate-guest.
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
  verifyAuthAndOwnership: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { POST } from '@/app/api/auth/migrate-guest/route';

describe('POST /api/auth/migrate-guest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when userId is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { gameState: {} },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/userId/);
  });

  it('returns 400 when gameState is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/gameState/);
  });

  it('returns 400 when both userId and gameState are missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

/**
 * tests/api/auth/claim-guest.test.ts
 *
 * Boundary + auth tests for POST /api/auth/claim-guest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { action: { limit: 100, windowMs: 60000 }, general: { limit: 200, windowMs: 60000 } },
}));

import { POST } from '@/app/api/auth/claim-guest/route';

describe('POST /api/auth/claim-guest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when newUserId is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/claim-guest',
      body: { deviceId: 'test-device' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/newUserId/);
  });

  it('returns 400 when deviceId is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/claim-guest',
      body: { newUserId: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/deviceId/);
  });

  it('returns 400 when newUserId is not a valid UUID', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/claim-guest',
      body: { newUserId: 'not-a-uuid', deviceId: 'test-device' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/UUID/i);
  });
});

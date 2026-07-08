/**
 * tests/api/cron/validate-ticks.test.ts
 *
 * Boundary tests for POST /api/cron/validate-ticks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { sync: { limit: 1, windowMs: 60000, failClosed: true } },
}));

import { POST } from '@/app/api/cron/validate-ticks/route';

describe('POST /api/cron/validate-ticks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set CRON_SECRET so auth check passes
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  it('returns 401 when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET;
    const req = buildRequest({ method: 'POST', url: '/api/cron/validate-ticks' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when authorization header is wrong', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/cron/validate-ticks',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

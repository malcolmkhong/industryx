/**
 * tests/api/market/pressure/record.test.ts
 *
 * Boundary + auth tests for POST /api/market/pressure/record.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { POST } from '@/app/api/market/pressure/record/route';

describe('POST /api/market/pressure/record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when resource is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { type: 'buy', amount: 10 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 400 when type is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', amount: 10 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 400 when amount is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', type: 'buy' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is not a positive number', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', type: 'buy', amount: -5 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when type is not buy or sell', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', type: 'rent', amount: 10 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/buy.*sell/i);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', type: 'buy', amount: 10 },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 503 when DB is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/market/pressure/record/route');
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', type: 'buy', amount: 10 },
    });
    const res = await fresh.POST(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

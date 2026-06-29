/**
 * tests/api/auth/confirm-link.test.ts
 *
 * Boundary + auth tests for POST /api/auth/confirm-link.
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

import { POST } from '@/app/api/auth/confirm-link/route';

describe('POST /api/auth/confirm-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when operationId is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/confirm-link',
      body: { idempotencyKey: 'key-1', preference: 'keep_guest' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/operationId/);
  });

  it('returns 400 when idempotencyKey is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/confirm-link',
      body: { operationId: 'op-1', preference: 'keep_guest' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/idempotencyKey/);
  });

  it('returns 400 when preference is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/confirm-link',
      body: { operationId: 'op-1', idempotencyKey: 'key-1' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/preference/);
  });

  it('returns 400 when preference is invalid', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/confirm-link',
      body: { operationId: 'op-1', idempotencyKey: 'key-1', preference: 'invalid' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/preference/i);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/confirm-link',
      body: { operationId: 'op-1', idempotencyKey: 'key-1', preference: 'keep_guest' },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });
});

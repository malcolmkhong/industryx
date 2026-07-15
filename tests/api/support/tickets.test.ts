/**
 * tests/api/support/tickets.test.ts
 *
 * Boundary + auth tests for GET/POST /api/support/tickets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { GET, POST } from '@/app/api/support/tickets/route';

describe('GET /api/support/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({ method: 'GET', url: '/api/support/tickets' });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/support/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when subject is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/support/tickets',
      body: { message: 'Help!' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/subject/i);
  });

  it('returns 400 when message is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/support/tickets',
      body: { subject: 'Help needed' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/message/i);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({
      method: 'POST',
      url: '/api/support/tickets',
      body: { subject: 'Help', message: 'Please help' },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });
});

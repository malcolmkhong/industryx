/**
 * tests/api/support/tickets[id]messages.test.ts
 *
 * Boundary + auth tests for POST /api/support/tickets/[id]/messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson, buildContext } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { POST } from '@/app/api/support/tickets/[id]/messages/route';

describe('POST /api/support/tickets/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when message is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/support/tickets/ticket-123/messages',
      body: {},
    });
    const ctx = buildContext({ id: 'ticket-123' });
    const res = await POST(req, ctx);
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
      url: '/api/support/tickets/ticket-123/messages',
      body: { message: 'Hello' },
    });
    const ctx = buildContext({ id: 'ticket-123' });
    const res = await POST(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

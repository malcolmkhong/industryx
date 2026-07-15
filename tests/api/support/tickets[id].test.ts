/**
 * tests/api/support/tickets[id].test.ts
 *
 * Boundary + auth tests for GET /api/support/tickets/[id].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson, buildContext } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

import { GET } from '@/app/api/support/tickets/[id]/route';

describe('GET /api/support/tickets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({ method: 'GET', url: '/api/support/tickets/ticket-123' });
    const ctx = buildContext({ id: 'ticket-123' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

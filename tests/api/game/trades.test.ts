/**
 * tests/api/market/trades/history.test.ts
 *
 * Boundary + auth tests for GET /api/market/trades/history.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));
vi.mock('@/lib/auth/guestCheck', () => ({
  getUserGuestStatus: vi.fn().mockResolvedValue({ isGuest: false }),
}));
vi.mock('@/lib/db/trades', () => ({
  getTradeHistory: vi.fn().mockResolvedValue({ trades: [], total: 0 }),
}));

import { GET } from '@/app/api/market/trades/history/route';

describe('GET /api/market/trades/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({ method: 'GET', url: '/api/market/trades/history' });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 403 when user is a guest', async () => {
    const { verifyAuth } = await import('@/lib/auth/verifyAuth');
    const { getUserGuestStatus } = await import('@/lib/auth/guestCheck');
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true, userId: 'guest-user', email: 'guest@example.com',
    });
    (getUserGuestStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ isGuest: true });
    const req = buildRequest({ method: 'GET', url: '/api/market/trades/history' });
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/Bind Account/i);
  });
});

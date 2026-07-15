/**
 * tests/api/auth/callback.test.ts
 *
 * Boundary tests for GET /api/auth/callback.
 * Tests OAuth code exchange redirect behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

// Mock next/headers to make cookies() work outside Next.js request context
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    get: vi.fn(),
  }),
}));

// Mock @supabase/ssr to control the exchangeCodeForSession result
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}));

import { GET } from '@/app/api/auth/callback/route';

describe('GET /api/auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 3xx redirect to /?auth=error when no code param', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/auth/callback' });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    const redirect = res.headers.get('location');
    expect(redirect).toContain('/?auth=error');
  });

  it('returns 3xx redirect to custom next param when code provided and exchange succeeds', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/auth/callback?code=abc123&next=/game' });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    const redirect = res.headers.get('location');
    expect(redirect).toContain('/game');
  });

  it('returns 3xx redirect to /?auth=error when code exchange fails', async () => {
    const { createServerClient } = await import('@supabase/ssr');
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: new Error('invalid_code') }),
      },
    });

    const req = buildRequest({ method: 'GET', url: '/api/auth/callback?code=badcode' });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    const redirect = res.headers.get('location');
    expect(redirect).toContain('/?auth=error');
  });
});

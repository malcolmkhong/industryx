/**
 * tests/api/market/history.test.ts
 *
 * Boundary + auth tests for GET /api/market/history.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/market/history/route';

describe('GET /api/market/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when database is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/access', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/market/history/route');
    const req = buildRequest({ method: 'GET', url: '/api/market/history' });
    const res = await fresh.GET(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

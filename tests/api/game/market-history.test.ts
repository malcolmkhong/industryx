/**
 * tests/api/game/market-history.test.ts
 *
 * Boundary + auth tests for GET /api/game/market-history.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/game/market-history/route';

describe('GET /api/game/market-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when database is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/game/market-history/route');
    const req = buildRequest({ method: 'GET', url: '/api/game/market-history' });
    const res = await fresh.GET(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

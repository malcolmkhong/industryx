/**
 * tests/api/market/tick.test.ts
 *
 * Boundary tests for POST /api/market/tick.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/market/tick/route';

describe('POST /api/market/tick', () => {
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
    const fresh = await import('@/app/api/market/tick/route');
    const res = await fresh.POST();
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

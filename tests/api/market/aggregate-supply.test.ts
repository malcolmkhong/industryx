/**
 * tests/api/market/supply/aggregate.test.ts
 *
 * Boundary tests for POST /api/market/supply/aggregate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { POST } from '@/app/api/market/supply/aggregate/route';

describe('POST /api/market/supply/aggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when database is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/access', () => ({
      createServiceRoleClient: () => null,
      // BUG-077: canonical boundary names mirror the legacy alias.
      getDbClient: () => null,
      requireDbClient: () => ({ from: vi.fn() }),
      isDbClientConfigured: vi.fn(() => true),
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/market/supply/aggregate/route');
    const res = await fresh.POST();
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

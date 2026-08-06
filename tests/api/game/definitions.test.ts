/**
 * tests/api/game/config/definitions.test.ts
 *
 * Boundary + auth tests for GET /api/game/config/definitions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/game/config/definitions/route';

describe('GET /api/game/config/definitions', () => {
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
    const fresh = await import('@/app/api/game/config/definitions/route');
    const res = await fresh.GET();
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

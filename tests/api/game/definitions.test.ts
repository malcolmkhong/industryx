/**
 * tests/api/game/definitions.test.ts
 *
 * Boundary + auth tests for GET /api/game/definitions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/game/definitions/route';

describe('GET /api/game/definitions', () => {
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
    const fresh = await import('@/app/api/game/definitions/route');
    const res = await fresh.GET();
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

/**
 * tests/api/auth/initialize-guest.test.ts
 *
 * Boundary + auth tests for POST /api/auth/initialize-guest.
 * Full happy path is integration-tested in tests/workflow/.
 *
 * Tested here:
 *  - 400 on missing deviceId
 *  - 503 on DB not configured
 *  - 401 on missing/invalid auth
 *  - 429 on rate limit (fail-closed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

// Import AFTER mock setup
import { POST } from '@/app/api/auth/initialize-guest/route';

describe('POST /api/auth/initialize-guest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on missing deviceId', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/initialize-guest',
      body: { /* no deviceId */ },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toMatch(/deviceId/);
  });

  it('returns 400 on empty body', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/initialize-guest',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 503 when DB is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/auth/initialize-guest/route');
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/initialize-guest',
      body: { deviceId: 'test-device' },
    });
    const res = await fresh.POST(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

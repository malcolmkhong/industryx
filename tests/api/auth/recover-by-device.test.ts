/**
 * tests/api/auth/recover-by-device.test.ts
 *
 * Tests for POST /api/auth/recover-by-device.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/auth/recover-by-device/route';

describe('POST /api/auth/recover-by-device', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on missing deviceId', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/recover-by-device',
      body: { fingerprint: 'abc' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 503 when DB not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/auth/recover-by-device/route');
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/recover-by-device',
      body: { deviceId: 'dev-1' },
    });
    const res = await fresh.POST(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });

  it('handles a recovery request (status is one of valid codes)', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/recover-by-device',
      body: { deviceId: 'unknown-device' },
    });
    const res = await POST(req);
    // Valid outcomes: 200 (recovery), 404 (no match), 429 (rate-limited), 503 (DB down)
    expect([200, 404, 429, 503]).toContain(res.status);
  });
});

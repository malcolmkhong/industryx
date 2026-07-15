/**
 * tests/api/platform/health.test.ts
 *
 * Tests for GET /api/platform/health — liveness probe.
 */

import { describe, it, expect, vi } from 'vitest';
import { readJson } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/platform/health/route';

describe('GET /api/platform/health', () => {
  it('returns 200 with status=ok when DB is connected', async () => {
    // Default mock has data: [], error: null which counts as ok
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson<any>(res);
    expect(body.status).toBe('ok');
    expect(body.db.status).toBe('connected');
    expect(typeof body.db.latencyMs).toBe('number');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.responseTimeMs).toBe('number');
  });

  it('returns 503 with status=unavailable when DB not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/access', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/platform/health/route');
    const res = await fresh.GET();
    expect(res.status).toBe(503);
    const body = await readJson<any>(res);
    expect(body.status).toBe('unavailable');
    expect(body.db.status).toBe('unavailable');
    vi.doUnmock('@/lib/supabase/server');
  });
});

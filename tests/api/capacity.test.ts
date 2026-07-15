/**
 * tests/api/platform/capacity/status.test.ts
 *
 * Tests for GET /api/platform/capacity/status — public capacity status (UI hints only).
 */

import { describe, it, expect, vi } from 'vitest';
import { readJson } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/platform/capacity/status/route';

describe('GET /api/platform/capacity/status', () => {
  it('returns CapacityInfo shape with default mock data', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson<any>(res);
    // CapacityInfo has these fields
    expect(body).toHaveProperty('max');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('utilizationPct');
  });

  it('returns FALLBACK defaults when DB not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/access', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/platform/capacity/status/route');
    const res = await fresh.GET();
    expect(res.status).toBe(200);
    const body = await readJson<any>(res);
    // FALLBACK: max=500, total=0, status='healthy'
    expect(body.max).toBe(500);
    expect(body.total).toBe(0);
    expect(body.status).toBe('healthy');
    vi.doUnmock('@/lib/supabase/server');
  });
});

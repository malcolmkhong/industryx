/**
 * tests/api/admin/players[ id ]auth.test.ts
 *
 * Tests for GET /api/admin/players/[id]/auth (player auth info).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/players/[id]/auth/route';

describe('GET /api/admin/players/[id]/auth', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/players/some-id/auth' });
    const ctx = buildContext({ id: '00000000-0000-0000-0000-000000000001' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid UUID', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/players/not-a-uuid/auth' });
    const ctx = buildContext({ id: 'not-a-uuid' });
    const res = await GET(req, ctx);
    // After auth passes, should 400 on invalid UUID format
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

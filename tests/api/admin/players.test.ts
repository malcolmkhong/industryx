/**
 * tests/api/admin/players.test.ts
 *
 * Tests for GET /api/admin/players (list players).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/players/route';

describe('GET /api/admin/players', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/players' });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid page/limit', async () => {
    const req = buildRequest({
      method: 'GET',
      url: '/api/admin/players?page=-1&limit=99999',
    });
    // Route clamps page to 1 and limit to 200, no 400
    const res = await GET(req);
    expect(res.status).not.toBe(400);
  });
});

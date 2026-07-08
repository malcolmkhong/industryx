/**
 * tests/api/admin/players[ id ].test.ts
 *
 * Tests for GET /api/admin/players/[id] (player detail).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/players/[id]/route';

describe('GET /api/admin/players/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/players/some-id' });
    const ctx = buildContext({ id: '00000000-0000-0000-0000-000000000001' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

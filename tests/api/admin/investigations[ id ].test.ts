/**
 * tests/api/admin/investigations[ id ].test.ts
 *
 * Tests for GET /api/admin/investigations/[id] (investigation detail).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/investigations/[id]/route';

describe('GET /api/admin/investigations/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/investigations/some-id' });
    const ctx = buildContext({ id: 'some-investigation-id' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

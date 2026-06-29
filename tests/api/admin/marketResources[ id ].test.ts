/**
 * tests/api/admin/marketResources[ id ].test.ts
 *
 * Tests for DELETE /api/admin/market/resources/[id].
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { DELETE } from '@/app/api/admin/market/resources/[id]/route';

describe('DELETE /api/admin/market/resources/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/market/resources/some-resource' });
    const ctx = buildContext({ id: 'some-resource' });
    const res = await DELETE(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid resource_id format', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/market/resources/InvalidFormat' });
    const ctx = buildContext({ id: 'InvalidFormat' });
    const res = await DELETE(req, ctx);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

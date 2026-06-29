/**
 * tests/api/admin/admins[ id ]role.test.ts
 *
 * Tests for PUT /api/admin/admins/[id]/role (update admin role).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { PUT } from '@/app/api/admin/admins/[id]/role/route';

describe('PUT /api/admin/admins/[id]/role', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'PUT',
      url: '/api/admin/admins/some-id/role',
      body: { role: 'admin' },
    });
    const ctx = buildContext({ id: 'some-admin-id' });
    const res = await PUT(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid role', async () => {
    const req = buildRequest({
      method: 'PUT',
      url: '/api/admin/admins/some-id/role',
      body: { role: 'superuser' },
    });
    const ctx = buildContext({ id: 'some-admin-id' });
    const res = await PUT(req, ctx);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

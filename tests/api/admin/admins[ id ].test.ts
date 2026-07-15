/**
 * tests/api/admin/users/admins[ id ].test.ts
 *
 * Tests for DELETE /api/admin/users/admins/[id] (remove admin).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { DELETE } from '@/app/api/admin/users/admins/[id]/route';

describe('DELETE /api/admin/users/admins/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/users/admins/some-id' });
    const ctx = buildContext({ id: 'some-admin-id' });
    const res = await DELETE(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

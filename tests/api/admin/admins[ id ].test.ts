/**
 * tests/api/admin/admins[ id ].test.ts
 *
 * Tests for DELETE /api/admin/admins/[id] (remove admin).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { DELETE } from '@/app/api/admin/admins/[id]/route';

describe('DELETE /api/admin/admins/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/admins/some-id' });
    const ctx = buildContext({ id: 'some-admin-id' });
    const res = await DELETE(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

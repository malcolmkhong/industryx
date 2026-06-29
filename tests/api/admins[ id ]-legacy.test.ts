/**
 * tests/api/admins[ id ]-legacy.test.ts
 *
 * Tests for DELETE /api/admins/[id] (legacy route — mirrors /api/admin/admins/[id]).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { DELETE } from '@/app/api/admins/[id]/route';

describe('DELETE /api/admins/[id] (legacy)', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/admins/some-id' });
    const ctx = buildContext({ id: 'some-admin-id' });
    const res = await DELETE(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

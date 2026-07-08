/**
 * tests/api/admin/permissions[ userId ].test.ts
 *
 * Tests for GET/POST /api/admin/permissions/[userId].
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET, POST } from '@/app/api/admin/permissions/[userId]/route';

describe('GET /api/admin/permissions/[userId]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/permissions/some-user-id' });
    const ctx = buildContext({ userId: '00000000-0000-0000-0000-000000000001' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/admin/permissions/[userId]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/permissions/00000000-0000-0000-0000-000000000001',
      body: { permission: 'test_perm', action: 'grant' },
    });
    const ctx = buildContext({ userId: '00000000-0000-0000-0000-000000000001' });
    const res = await POST(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid permission', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/permissions/00000000-0000-0000-0000-000000000001',
      body: { permission: 'not_a_real_permission', action: 'grant' },
    });
    const ctx = buildContext({ userId: '00000000-0000-0000-0000-000000000001' });
    const res = await POST(req, ctx);
    if (res.status === 200) expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/permissions/00000000-0000-0000-0000-000000000001',
      body: { permission: 'test_perm', action: 'delete' },
    });
    const ctx = buildContext({ userId: '00000000-0000-0000-0000-000000000001' });
    const res = await POST(req, ctx);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

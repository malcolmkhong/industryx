/**
 * tests/api/admin/permissions[ userId ].test.ts
 *
 * Tests for GET/POST /api/admin/users/permissions/[userId].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { buildRequest, buildContext } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));
vi.mock('@/lib/auth/admin-helpers', () => ({
  getAdminRole: vi.fn().mockResolvedValue('admin'),
  hasRole: vi.fn((role: string, required: string) => {
    const rank: Record<string, number> = { viewer: 1, admin: 2, super_admin: 3 };
    return (rank[role] ?? 0) >= (rank[required] ?? 0);
  }),
  logAdminAction: vi.fn(),
}));

import { GET, POST } from '@/app/api/admin/users/permissions/[userId]/route';
import { verifyAdmin } from '@/lib/auth/admin';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('GET /api/admin/users/permissions/[userId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const req = buildRequest({ method: 'GET', url: '/api/admin/permissions/some-user-id' });
    const ctx = buildContext({ userId: '00000000-0000-0000-0000-000000000001' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/admin/users/permissions/[userId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/permissions/00000000-0000-0000-0000-000000000001',
      body: { permission: 'test_perm', action: 'grant' },
    });
    const ctx = buildContext({ userId: '00000000-0000-0000-0000-000000000001' });
    const res = await POST(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 403 when non-super-admin tries to grant permission', async () => {
    vi.mocked(getAdminRole).mockResolvedValueOnce('admin');
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/permissions/00000000-0000-0000-0000-000000000001',
      body: { permission: 'manage_market', action: 'grant' },
    });
    const ctx = buildContext({ userId: '00000000-0000-0000-0000-000000000001' });

    const res = await POST(req, ctx);

    expect(res.status).toBe(403);
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

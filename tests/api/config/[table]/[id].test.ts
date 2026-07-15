/**
 * tests/api/admin/config/[table]/[id].test.ts
 *
 * Boundary + admin auth tests for GET/PUT/DELETE /api/admin/config/[table]/[id].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson, buildContext } from '../../helpers/request';
import { mockSupabaseServer } from '../../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockReturnValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));
vi.mock('@/lib/auth/admin-helpers', () => ({
  getAdminRole: vi.fn().mockResolvedValue('admin'),
  canWrite: vi.fn((role: string) => role === 'admin' || role === 'super_admin'),
  logAdminAction: vi.fn(),
}));

import { GET, PUT, DELETE } from '@/app/api/admin/config/[table]/[id]/route';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('GET /api/admin/config/[table]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/config/not-a-table/123' });
    const ctx = buildContext({ table: 'not-a-table', id: '123' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAdmin } = await import('@/lib/auth/admin');
    (verifyAdmin as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const req = buildRequest({ method: 'GET', url: '/api/admin/config/buildings/bld-1' });
    const ctx = buildContext({ table: 'buildings', id: 'bld-1' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/admin/config/[table]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({
      method: 'PUT',
      url: '/api/admin/config/not-a-table/123',
      body: {},
    });
    const ctx = buildContext({ table: 'not-a-table', id: '123' });
    const res = await PUT(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAdmin } = await import('@/lib/auth/admin');
    (verifyAdmin as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const req = buildRequest({ method: 'PUT', url: '/api/admin/config/buildings/bld-1', body: {} });
    const ctx = buildContext({ table: 'buildings', id: 'bld-1' });
    const res = await PUT(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when viewer tries to update config row', async () => {
    vi.mocked(getAdminRole).mockResolvedValueOnce('viewer');
    const req = buildRequest({
      method: 'PUT',
      url: '/api/admin/config/game_config_rank_thresholds/99',
      body: { name: 'Changed Rank' },
    });
    const ctx = buildContext({ table: 'game_config_rank_thresholds', id: '99' });

    const res = await PUT(req, ctx);

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/config/[table]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/config/not-a-table/123' });
    const ctx = buildContext({ table: 'not-a-table', id: '123' });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAdmin } = await import('@/lib/auth/admin');
    (verifyAdmin as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/config/buildings/bld-1' });
    const ctx = buildContext({ table: 'buildings', id: 'bld-1' });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when viewer tries to delete config row', async () => {
    vi.mocked(getAdminRole).mockResolvedValueOnce('viewer');
    const req = buildRequest({
      method: 'DELETE',
      url: '/api/admin/config/game_config_rank_thresholds/99',
    });
    const ctx = buildContext({ table: 'game_config_rank_thresholds', id: '99' });

    const res = await DELETE(req, ctx);

    expect(res.status).toBe(403);
  });
});

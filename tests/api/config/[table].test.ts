/**
 * tests/api/admin/config/[table].test.ts
 *
 * Boundary + admin auth tests for GET/POST /api/admin/config/[table].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson, buildContext } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockReturnValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));
vi.mock('@/lib/auth/admin-helpers', () => ({
  getAdminRole: vi.fn().mockResolvedValue('admin'),
  canWrite: vi.fn((role: string) => role === 'admin' || role === 'super_admin'),
  logAdminAction: vi.fn(),
}));

import { GET, POST } from '@/app/api/admin/config/[table]/route';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('GET /api/admin/config/[table]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/config/not-a-table' });
    const ctx = buildContext({ table: 'not-a-table' });
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
    const req = buildRequest({ method: 'GET', url: '/api/admin/config/buildings' });
    const ctx = buildContext({ table: 'buildings' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/config/[table]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/config/not-a-table',
      body: {},
    });
    const ctx = buildContext({ table: 'not-a-table' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAdmin } = await import('@/lib/auth/admin');
    (verifyAdmin as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const req = buildRequest({ method: 'POST', url: '/api/admin/config/buildings', body: {} });
    const ctx = buildContext({ table: 'buildings' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when viewer tries to create config row', async () => {
    vi.mocked(getAdminRole).mockResolvedValueOnce('viewer');
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/config/game_config_rank_thresholds',
      body: { rank: 99, name: 'Test Rank', score_required: 12345 },
    });
    const ctx = buildContext({ table: 'game_config_rank_thresholds' });

    const res = await POST(req, ctx);

    expect(res.status).toBe(403);
  });
});

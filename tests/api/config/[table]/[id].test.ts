/**
 * tests/api/config/[table]/[id].test.ts
 *
 * Boundary + admin auth tests for GET/PUT/DELETE /api/config/[table]/[id].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson, buildContext } from '../../helpers/request';
import { mockSupabaseServer } from '../../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockReturnValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));

import { GET, PUT, DELETE } from '@/app/api/config/[table]/[id]/route';

describe('GET /api/config/[table]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/config/not-a-table/123' });
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
    const req = buildRequest({ method: 'GET', url: '/api/config/buildings/bld-1' });
    const ctx = buildContext({ table: 'buildings', id: 'bld-1' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/config/[table]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({
      method: 'PUT',
      url: '/api/config/not-a-table/123',
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
    const req = buildRequest({ method: 'PUT', url: '/api/config/buildings/bld-1', body: {} });
    const ctx = buildContext({ table: 'buildings', id: 'bld-1' });
    const res = await PUT(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/config/[table]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/config/not-a-table/123' });
    const ctx = buildContext({ table: 'not-a-table', id: '123' });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAdmin } = await import('@/lib/auth/admin');
    (verifyAdmin as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const req = buildRequest({ method: 'DELETE', url: '/api/config/buildings/bld-1' });
    const ctx = buildContext({ table: 'buildings', id: 'bld-1' });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
  });
});

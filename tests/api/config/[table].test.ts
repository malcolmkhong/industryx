/**
 * tests/api/config/[table].test.ts
 *
 * Boundary + admin auth tests for GET/POST /api/config/[table].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson, buildContext } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockReturnValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));

import { GET, POST } from '@/app/api/config/[table]/route';

describe('GET /api/config/[table]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/config/not-a-table' });
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
    const req = buildRequest({ method: 'GET', url: '/api/config/buildings' });
    const ctx = buildContext({ table: 'buildings' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/config/[table]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when table name is invalid', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/config/not-a-table',
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
    const req = buildRequest({ method: 'POST', url: '/api/config/buildings', body: {} });
    const ctx = buildContext({ table: 'buildings' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });
});

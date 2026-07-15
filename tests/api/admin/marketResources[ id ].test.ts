/**
 * tests/api/admin/market/overviewResources[ id ].test.ts
 *
 * Tests for DELETE /api/admin/market/resources/[id].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { buildRequest, buildContext } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));
vi.mock('@/lib/auth/admin-helpers', () => ({
  getAdminRole: vi.fn().mockResolvedValue('admin'),
  canWrite: vi.fn((role: string) => role === 'admin' || role === 'super_admin'),
}));

import { DELETE } from '@/app/api/admin/market/resources/[id]/route';
import { verifyAdmin } from '@/lib/auth/admin';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('DELETE /api/admin/market/resources/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/market/resources/some-resource' });
    const ctx = buildContext({ id: 'some-resource' });
    const res = await DELETE(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid resource_id format', async () => {
    const req = buildRequest({ method: 'DELETE', url: '/api/admin/market/resources/InvalidFormat' });
    const ctx = buildContext({ id: 'InvalidFormat' });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(400);
  });
});

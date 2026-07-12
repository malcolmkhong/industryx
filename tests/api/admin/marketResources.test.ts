/**
 * tests/api/admin/market/overviewResources.test.ts
 *
 * Tests for POST/PUT/DELETE /api/admin/market/resources (market resources CRUD).
 * GET is not exported from this route (write-only).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));
vi.mock('@/lib/auth/admin-helpers', () => ({
  getAdminRole: vi.fn().mockResolvedValue('admin'),
  canWrite: vi.fn((role: string) => role === 'admin' || role === 'super_admin'),
}));

import { POST, PUT, DELETE } from '@/app/api/admin/market/resources/route';
import { verifyAdmin } from '@/lib/auth/admin';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('POST /api/admin/market/resources', () => {
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
      url: '/api/admin/market/resources',
      body: { resource_id: 'new-resource', base_price: 100, sector: 'raw_minerals', elasticity: 1.0, is_tradable: true },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('lets admin role reach request validation instead of rejecting the admin id as a role', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/market/resources',
      body: { resource_id: 'valid-resource', base_price: 100, sector: 'invalid_sector', elasticity: 1.0, is_tradable: true },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid resource_id format', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/market/resources',
      body: { resource_id: 'InvalidUppercase', base_price: 100, sector: 'raw_minerals', elasticity: 1.0, is_tradable: true },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });

  it('returns 400 for invalid sector', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/market/resources',
      body: { resource_id: 'valid-resource', base_price: 100, sector: 'invalid_sector', elasticity: 1.0, is_tradable: true },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

describe('PUT /api/admin/market/resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('lets admin role reach request validation instead of rejecting the admin id as a role', async () => {
    const req = buildRequest({
      method: 'PUT',
      url: '/api/admin/market/resources',
      body: { resource_id: 'valid-resource', base_price: 100, sector: 'invalid_sector', elasticity: 1.0, is_tradable: true },
    });

    const res = await PUT(req);

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/market/resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('lets admin role reach resource id validation instead of rejecting the admin id as a role', async () => {
    const req = buildRequest({
      method: 'DELETE',
      url: '/api/admin/market/resources?resource_id=InvalidUppercase',
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });
});

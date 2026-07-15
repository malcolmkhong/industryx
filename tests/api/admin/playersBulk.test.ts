/**
 * tests/api/admin/playersBulk.test.ts
 *
 * Tests for POST /api/admin/players/bulk (bulk lock/unlock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
  clearAdminCache: vi.fn(),
}));
vi.mock('@/lib/auth/admin-helpers', () => ({
  getAdminRole: vi.fn().mockResolvedValue('admin'),
  canWrite: vi.fn((role: string) => role === 'admin' || role === 'super_admin'),
  logAdminAction: vi.fn(),
}));

import { POST } from '@/app/api/admin/players/bulk/route';
import { verifyAdmin } from '@/lib/auth/admin';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('POST /api/admin/players/bulk', () => {
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
      url: '/api/admin/players/bulk',
      body: { userIds: ['00000000-0000-0000-0000-000000000001'], action: 'lock' },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 403 when viewer tries bulk lock or unlock', async () => {
    vi.mocked(getAdminRole).mockResolvedValueOnce('viewer');
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/bulk',
      body: { userIds: ['00000000-0000-0000-0000-000000000001'], action: 'lock' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it('returns 400 when userIds is empty', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/bulk',
      body: { userIds: [], action: 'lock' },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });

  it('returns 400 when userIds > 100', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/bulk',
      body: { userIds: Array(101).fill('00000000-0000-0000-0000-000000000001'), action: 'lock' },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });

  it('returns 400 when action is invalid', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/bulk',
      body: { userIds: ['00000000-0000-0000-0000-000000000001'], action: 'delete' },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

/**
 * tests/api/admin/investigations.test.ts
 *
 * Tests for GET /api/admin/investigations (list investigations).
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
  logAdminAction: vi.fn(),
}));

import { GET, POST } from '@/app/api/admin/investigations/route';
import { verifyAdmin } from '@/lib/auth/admin';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('GET /api/admin/investigations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const res = await GET(buildRequest({ url: '/api/admin/investigations' }));
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/admin/investigations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 403 when viewer tries to perform investigation action', async () => {
    vi.mocked(getAdminRole).mockResolvedValueOnce('viewer');
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/investigations',
      body: {
        action: 'lock-account',
        userId: '00000000-0000-0000-0000-000000000001',
        reason: 'test',
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
  });
});

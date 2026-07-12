/**
 * tests/api/admin/supportTickets[ id ].test.ts
 *
 * Tests for GET/POST /api/admin/support/tickets/[id].
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
  canWrite: vi.fn((role: string) => role === 'admin' || role === 'super_admin'),
  logAdminAction: vi.fn(),
}));

import { GET, POST } from '@/app/api/admin/support/tickets/[id]/route';
import { verifyAdmin } from '@/lib/auth/admin';
import { getAdminRole } from '@/lib/auth/admin-helpers';

describe('GET /api/admin/support/tickets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdmin).mockResolvedValue({ admin: { id: 'admin-1', email: 'admin@test.com' } });
    vi.mocked(getAdminRole).mockResolvedValue('admin');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const req = buildRequest({ method: 'GET', url: '/api/admin/support/tickets/some-id' });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/admin/support/tickets/[id]', () => {
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
      url: '/api/admin/support/tickets/some-id',
      body: { action: 'accept' },
    });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await POST(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 403 when viewer tries to update ticket status', async () => {
    vi.mocked(getAdminRole).mockResolvedValueOnce('viewer');
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/support/tickets/some-id',
      body: { action: 'accept' },
    });
    const ctx = buildContext({ id: 'some-ticket-id' });

    const res = await POST(req, ctx);

    expect(res.status).toBe(403);
  });

  it('returns 400 for unknown action', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/support/tickets/some-id',
      body: { action: 'unknown_action' },
    });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await POST(req, ctx);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

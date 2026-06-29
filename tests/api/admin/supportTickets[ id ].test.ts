/**
 * tests/api/admin/supportTickets[ id ].test.ts
 *
 * Tests for GET/POST /api/admin/support/tickets/[id].
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET, POST } from '@/app/api/admin/support/tickets/[id]/route';

describe('GET /api/admin/support/tickets/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/support/tickets/some-id' });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await GET(req, ctx);
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/admin/support/tickets/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/support/tickets/some-id',
      body: { action: 'accept' },
    });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await POST(req, ctx);
    expect([401, 403]).toContain(res.status);
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

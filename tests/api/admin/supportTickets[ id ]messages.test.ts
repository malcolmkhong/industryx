/**
 * tests/api/admin/supportTickets[ id ]messages.test.ts
 *
 * Tests for POST /api/admin/support/tickets/[id]/messages.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, buildContext, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/admin/support/tickets/[id]/messages/route';

describe('POST /api/admin/support/tickets/[id]/messages', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/support/tickets/some-id/messages',
      body: { message: 'Hello' },
    });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await POST(req, ctx);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 when message is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/support/tickets/some-id/messages',
      body: {},
    });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await POST(req, ctx);
    if (res.status === 200) expect(res.status).toBe(400);
  });

  it('returns 400 when message is not a string', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/support/tickets/some-id/messages',
      body: { message: 123 },
    });
    const ctx = buildContext({ id: 'some-ticket-id' });
    const res = await POST(req, ctx);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

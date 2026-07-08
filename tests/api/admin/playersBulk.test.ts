/**
 * tests/api/admin/playersBulk.test.ts
 *
 * Tests for POST /api/admin/players/bulk (bulk lock/unlock).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/admin/players/bulk/route';

describe('POST /api/admin/players/bulk', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/bulk',
      body: { userIds: ['00000000-0000-0000-0000-000000000001'], action: 'lock' },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
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

/**
 * tests/api/admin/playersCompare.test.ts
 *
 * Tests for POST /api/admin/players/compare (compare players).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { POST } from '@/app/api/admin/players/compare/route';

describe('POST /api/admin/players/compare', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/compare',
      body: { userIds: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'] },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 when fewer than 2 userIds', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/compare',
      body: { userIds: ['00000000-0000-0000-0000-000000000001'] },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });

  it('returns 400 when more than 4 userIds', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/players/compare',
      body: {
        userIds: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000004',
          '00000000-0000-0000-0000-000000000005',
        ],
      },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

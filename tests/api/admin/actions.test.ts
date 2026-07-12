/**
 * tests/api/admin/audit/player-actions.test.ts
 *
 * Tests for GET /api/admin/audit/player-actions (player action audit log).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/audit/player-actions/route';

describe('GET /api/admin/audit/player-actions', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/audit/player-actions' });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });
});

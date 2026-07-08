/**
 * tests/api/admin/admin-actions.test.ts
 *
 * Tests for GET /api/admin/admin-actions (admin action audit trail).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/admin-actions/route';

describe('GET /api/admin/admin-actions', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/admin/admin-actions' });
    const res = await GET(req);
    expect([401, 403]).toContain(res.status);
  });
});

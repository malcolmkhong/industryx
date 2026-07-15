/**
 * tests/api/admin/users/admins.test.ts
 *
 * Tests for GET /api/admin/users/admins (list admins).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/users/admins/route';

describe('GET /api/admin/users/admins', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await GET();
    expect([401, 403]).toContain(res.status);
  });
});

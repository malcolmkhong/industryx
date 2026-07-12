/**
 * tests/api/admin/system/stats.test.ts
 *
 * Tests for GET /api/admin/system/stats (admin dashboard aggregates).
 */

import { describe, it, expect, vi } from 'vitest';
import { readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/system/stats/route';

describe('GET /api/admin/system/stats', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

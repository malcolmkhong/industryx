/**
 * tests/api/admin/stats.test.ts
 *
 * Tests for GET /api/admin/stats (admin dashboard aggregates).
 */

import { describe, it, expect, vi } from 'vitest';
import { readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/stats/route';

describe('GET /api/admin/stats', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

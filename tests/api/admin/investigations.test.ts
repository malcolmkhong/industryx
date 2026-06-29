/**
 * tests/api/admin/investigations.test.ts
 *
 * Tests for GET /api/admin/investigations (list investigations).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/investigations/route';

describe('GET /api/admin/investigations', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await GET();
    expect([401, 403]).toContain(res.status);
  });
});

/**
 * tests/api/admin/system/jobs.test.ts
 *
 * Tests for GET /api/admin/system/jobs (background jobs status).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/admin/system/jobs/route';

describe('GET /api/admin/system/jobs', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await GET();
    expect([401, 403]).toContain(res.status);
  });
});

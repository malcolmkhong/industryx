/**
 * tests/api/admins-legacy.test.ts
 *
 * Tests for GET /api/admins (legacy route — mirrors /api/admin/admins).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/admins/route';

describe('GET /api/admins (legacy)', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await GET();
    expect([401, 403]).toContain(res.status);
  });
});

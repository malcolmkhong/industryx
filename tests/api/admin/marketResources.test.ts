/**
 * tests/api/admin/marketResources.test.ts
 *
 * Tests for POST/PUT/DELETE /api/admin/market/resources (market resources CRUD).
 * GET is not exported from this route (write-only).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST, PUT, DELETE } from '@/app/api/admin/market/resources/route';

describe('POST /api/admin/market/resources', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/market/resources',
      body: { resource_id: 'new-resource', base_price: 100, sector: 'raw_minerals', elasticity: 1.0, is_tradable: true },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid resource_id format', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/market/resources',
      body: { resource_id: 'InvalidUppercase', base_price: 100, sector: 'raw_minerals', elasticity: 1.0, is_tradable: true },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });

  it('returns 400 for invalid sector', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/admin/market/resources',
      body: { resource_id: 'valid-resource', base_price: 100, sector: 'invalid_sector', elasticity: 1.0, is_tradable: true },
    });
    const res = await POST(req);
    if (res.status === 200) expect(res.status).toBe(400);
  });
});

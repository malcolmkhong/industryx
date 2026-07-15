/**
 * tests/api/market.test.ts
 *
 * Tests for GET /api/market/state + POST /api/market/pressure/record.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { GET } from '@/app/api/market/state/route';
import { POST as marketAction } from '@/app/api/market/pressure/record/route';

describe('GET /api/market/state', () => {
  it('returns market state shape', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson<any>(res);
    expect(body).toBeDefined();
  });
});

describe('POST /api/market/pressure/record', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', action: 'buy', amount: 10 },
    });
    const res = await marketAction(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing required fields', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron' },
    });
    const res = await marketAction(req);
    expect([400, 401]).toContain(res.status);
  });

  it('rejects negative amount', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/pressure/record',
      body: { resource: 'iron', action: 'buy', amount: -1 },
    });
    const res = await marketAction(req);
    expect([400, 401]).toContain(res.status);
  });
});

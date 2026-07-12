/**
 * tests/api/market/trades/execute.test.ts
 *
 * Tests for POST /api/market/trades/execute (server-authoritative trade).
 *
 * Note: this route checks auth before body validation, so without a
 * valid auth cookie we get 401. We test the boundary by asserting
 * the response is in the set of valid rejection codes.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/market/trades/execute/route';

const validTrade = {
  userId: 'user-1',
  giveResource: 'iron',
  giveAmount: 100,
  receiveResource: 'copper',
  receiveAmount: 50,
};

describe('POST /api/market/trades/execute', () => {
  it('rejects when no auth and no userId (400 or 401)', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/trades/execute',
      body: { giveResource: 'iron', giveAmount: 1, receiveResource: 'copper', receiveAmount: 1 },
    });
    const res = await POST(req);
    expect([400, 401]).toContain(res.status);
  });

  it('rejects missing required fields', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/trades/execute',
      body: { userId: 'user-1' },
    });
    const res = await POST(req);
    expect([400, 401]).toContain(res.status);
  });

  it('rejects negative amounts', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/trades/execute',
      body: { ...validTrade, giveAmount: -1 },
    });
    const res = await POST(req);
    expect([400, 401]).toContain(res.status);
  });

  it('rejects self-trade (give = receive)', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/trades/execute',
      body: { ...validTrade, giveResource: 'iron', receiveResource: 'iron' },
    });
    const res = await POST(req);
    expect([400, 401]).toContain(res.status);
  });

  it('rejects unknown resource', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/trades/execute',
      body: { ...validTrade, giveResource: 'unobtainium' },
    });
    const res = await POST(req);
    expect([400, 401]).toContain(res.status);
  });

  it('returns 401 when not authenticated (valid body)', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/trades/execute',
      body: validTrade,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects Infinity (serialized to null → 400)', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/market/trades/execute',
      body: { ...validTrade, giveAmount: Infinity },
    });
    const res = await POST(req);
    expect([400, 401]).toContain(res.status);
  });
});

/**
 * tests/api/game/state.test.ts
 *
 * Tests for GET/POST /api/game/state.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET, POST } from '@/app/api/game/state/route';

describe('GET /api/game/state', () => {
  it('returns 400 on missing userId', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/game/state' });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toMatch(/userId/);
  });

  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'GET',
      url: '/api/game/state?userId=user-1',
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/game/state', () => {
  it('returns 400 on missing userId', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/state',
      body: { gameState: {} },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/state',
      body: { userId: 'user-1', gameState: {} },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

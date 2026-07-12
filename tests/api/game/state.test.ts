/**
 * tests/api/game/state/sync.test.ts
 *
 * Tests for GET/POST /api/game/state/sync.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET, POST } from '@/app/api/game/state/sync/route';

describe('GET /api/game/state/sync', () => {
  it('returns 400 on missing userId', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/game/state/sync' });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/userId/);
  });

  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'GET',
      url: '/api/game/state/sync?userId=user-1',
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/game/state/sync', () => {
  it('returns 400 on missing userId', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/state/sync',
      body: { gameState: {} },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/game/state/sync',
      body: { userId: 'user-1', gameState: {} },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

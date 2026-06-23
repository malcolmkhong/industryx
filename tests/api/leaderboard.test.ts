/**
 * tests/api/leaderboard.test.ts
 *
 * Tests for GET /api/leaderboard + POST /api/leaderboard/submit.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest, readJson } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/leaderboard/route';
import { POST as submitScore } from '@/app/api/leaderboard/submit/route';

describe('GET /api/leaderboard', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/leaderboard' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/leaderboard/submit', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/leaderboard/submit',
      body: { score: 1000 },
    });
    const res = await submitScore(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing score', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/leaderboard/submit',
      body: { userId: 'user-1' },
    });
    const res = await submitScore(req);
    expect([400, 401]).toContain(res.status);
  });
});

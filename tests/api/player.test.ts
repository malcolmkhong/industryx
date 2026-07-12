/**
 * tests/api/player/progress.test.ts
 *
 * Tests for GET/POST /api/player/progress (cloud save).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET, POST } from '@/app/api/player/progress/route';

describe('GET /api/player/progress', () => {
  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({ method: 'GET', url: '/api/player/progress?userId=user-1' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/player/progress', () => {
  it('rejects empty body (400 or 401)', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/player/progress',
      body: {},
    });
    const res = await POST(req);
    // Could be 400 (body) or 401 (auth runs first)
    expect([400, 401]).toContain(res.status);
  });
});

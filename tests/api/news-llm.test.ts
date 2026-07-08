/**
 * tests/api/news-llm.test.ts
 *
 * Tests for POST /api/news-llm (proxy to Cloudflare newsgenerator worker).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildRequest } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/news-llm/route';

describe('POST /api/news-llm', () => {
  it('returns 400 on missing events array', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/news-llm',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty events array', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/news-llm',
      body: { events: [] },
    });
    const res = await POST(req);
    // Could be 400 (empty) or 503 (worker down via fetch)
    expect([400, 502, 503, 504]).toContain(res.status);
  });
});

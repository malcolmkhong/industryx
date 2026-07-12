/**
 * tests/api/platform/waitlist.test.ts
 *
 * Boundary tests for POST /api/platform/waitlist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/platform/waitlist/route';

describe('POST /api/platform/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when email is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/platform/waitlist',
      body: { name: 'John' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 on invalid JSON body', async () => {
    const { NextRequest } = await import('next/server');
    const badReq = new NextRequest('http://localhost:3000/api/platform/waitlist', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it('returns 503 when DB is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/platform/waitlist/route');
    const req = buildRequest({
      method: 'POST',
      url: '/api/platform/waitlist',
      body: { email: 'test@example.com' },
    });
    const res = await fresh.POST(req);
    expect(res.status).toBe(503);
    vi.doUnmock('@/lib/supabase/server');
  });
});

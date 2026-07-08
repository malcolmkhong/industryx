/**
 * tests/api/auth/update-profile.test.ts
 *
 * Tests for POST /api/auth/update-profile.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { POST } from '@/app/api/auth/update-profile/route';

describe('POST /api/auth/update-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on missing userId', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/update-profile',
      body: { displayName: 'Test' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing displayName', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/update-profile',
      body: { userId: 'user-1' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-string displayName', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/update-profile',
      body: { userId: 'user-1', displayName: 123 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/update-profile',
      body: { userId: 'user-1', displayName: 'Test' },
    });
    const res = await POST(req);
    // No auth cookie → verifyAuthAndOwnership returns 401
    expect(res.status).toBe(401);
  });
});

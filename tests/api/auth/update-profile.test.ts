/**
 * tests/api/auth/profile/update.test.ts
 *
 * Tests for POST /api/auth/profile/update.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/db/access', () => mockSupabaseServer());

import { POST } from '@/app/api/auth/profile/update/route';

describe('POST /api/auth/profile/update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on missing userId', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/profile/update',
      body: { displayName: 'Test' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing displayName', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/profile/update',
      body: { userId: 'user-1' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-string displayName', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/profile/update',
      body: { userId: 'user-1', displayName: 123 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/profile/update',
      body: { userId: 'user-1', displayName: 'Test' },
    });
    const res = await POST(req);
    // No auth cookie → verifyAuthAndOwnership returns 401
    expect(res.status).toBe(401);
  });
});

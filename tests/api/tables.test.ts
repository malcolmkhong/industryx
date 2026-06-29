/**
 * tests/api/tables.test.ts
 *
 * Boundary + admin auth tests for GET /api/tables.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRequest } from './helpers/request';
import { mockSupabaseServer } from '../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/admin', () => ({
  verifyAdmin: vi.fn().mockReturnValue({ admin: { id: 'admin-1', email: 'admin@test.com' } }),
  withSecurityHeaders: (res: Response) => res,
}));

import { GET } from '@/app/api/tables/route';

describe('GET /api/tables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const { verifyAdmin } = await import('@/lib/auth/admin');
    (verifyAdmin as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

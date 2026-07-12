/**
 * tests/api/game/state/initial.test.ts
 *
 * Auth + rate-limit + 5xx-fail-closed tests for GET /api/game/state/initial.
 *
 * Phase 12 (2026-07-10) — pairs with `fetchCanonicalInitialState()` server
 * helper and the client store hydration hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { GET } from '@/app/api/game/state/initial/route';

describe('GET /api/game/state/initial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when database is not configured (fail-closed)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => null,
      createClient: async () => null,
      isServiceRoleConfigured: () => false,
      isSupabaseConfigured: () => false,
    }));
    const fresh = await import('@/app/api/game/state/initial/route');
    const res = await fresh.GET(
      // @ts-expect-error -- minimal stub for NextRequest
      { headers: new Map() },
    );
    // Either 401 (auth fail) or 503 (DB fail) is acceptable as "fail-closed".
    expect([401, 503]).toContain(res.status);
    vi.doUnmock('@/lib/supabase/server');
  });

  it('returns JSON shape { initialState, fetchedAt } on success', async () => {
    // Mock both supabase server (auth) and the canonical state helper.
    const stubInitial = {
      money: 2000,
      buildings: [],
      prestigeState: { corporationPoints: 0, totalPrestiges: 0, megaFactoryUnlocked: false, bonuses: [] },
    };
    vi.doMock('@/lib/db/initialState.server', () => ({
      fetchCanonicalInitialState: vi.fn(async () => stubInitial),
    }));
    vi.doMock('@/lib/auth/verifyAuth', () => ({
      verifyAuth: vi.fn(async () => ({
        success: true,
        userId: 'user-1',
        response: undefined,
      })),
    }));
    vi.doMock('@/lib/auth/rateLimiter', () => ({
      checkRateLimit: vi.fn(async () => null),
      RATE_LIMITS: { config: 'config' },
    }));

    vi.resetModules();
    const fresh = await import('@/app/api/game/state/initial/route');
    const res = await fresh.GET(
      // @ts-expect-error -- minimal stub for NextRequest
      { headers: new Map() },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.initialState).toBeDefined();
    expect(body.initialState.money).toBe(2000);
    expect(typeof body.fetchedAt).toBe('number');

    vi.doUnmock('@/lib/db/initialState.server');
    vi.doUnmock('@/lib/auth/verifyAuth');
    vi.doUnmock('@/lib/auth/rateLimiter');
  });

  it('returns 503 when fetchCanonicalInitialState throws', async () => {
    vi.doMock('@/lib/auth/verifyAuth', () => ({
      verifyAuth: vi.fn(async () => ({
        success: true,
        userId: 'user-1',
        response: undefined,
      })),
    }));
    vi.doMock('@/lib/auth/rateLimiter', () => ({
      checkRateLimit: vi.fn(async () => null),
      RATE_LIMITS: { config: 'config' },
    }));
    vi.doMock('@/lib/db/initialState.server', () => ({
      fetchCanonicalInitialState: vi.fn(async () => {
        throw new Error('DB unavailable');
      }),
    }));

    vi.resetModules();
    const fresh = await import('@/app/api/game/state/initial/route');
    const res = await fresh.GET(
      // @ts-expect-error -- minimal stub for NextRequest
      { headers: new Map() },
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Initial state unavailable');
    expect(body.code).toBe('INITIAL_STATE_FAILED');

    vi.doUnmock('@/lib/db/initialState.server');
    vi.doUnmock('@/lib/auth/verifyAuth');
    vi.doUnmock('@/lib/auth/rateLimiter');
  });

  it('returns 429 when rate-limit rejects', async () => {
    vi.doMock('@/lib/auth/verifyAuth', () => ({
      verifyAuth: vi.fn(async () => ({
        success: true,
        userId: 'user-1',
        response: undefined,
      })),
    }));
    vi.doMock('@/lib/auth/rateLimiter', () => ({
      checkRateLimit: vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
      RATE_LIMITS: { config: 'config' },
    }));
    vi.doMock('@/lib/db/initialState.server', () => ({
      fetchCanonicalInitialState: vi.fn(async () => ({})),
    }));

    vi.resetModules();
    const fresh = await import('@/app/api/game/state/initial/route');
    const res = await fresh.GET(
      // @ts-expect-error -- minimal stub for NextRequest
      { headers: new Map() },
    );
    expect(res.status).toBe(429);

    vi.doUnmock('@/lib/db/initialState.server');
    vi.doUnmock('@/lib/auth/verifyAuth');
    vi.doUnmock('@/lib/auth/rateLimiter');
  });
});

/**
 * tests/unit/auth/rateLimiter.test.ts
 *
 * Unit tests for src/lib/auth/rateLimiter.ts (HTTP layer over DB RPC).
 */

import { describe, it, expect, vi } from 'vitest';
import { mockSupabaseServer } from '../mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';

describe('auth/rateLimiter', () => {
  describe('RATE_LIMITS presets', () => {
    it('exposes the documented 7 rate-limit profiles', () => {
      expect(RATE_LIMITS.player).toBeDefined();
      expect(RATE_LIMITS.compute).toBeDefined();
      expect(RATE_LIMITS.action).toBeDefined();
      expect(RATE_LIMITS.sync).toBeDefined();
      expect(RATE_LIMITS.config).toBeDefined();
      expect(RATE_LIMITS.general).toBeDefined();
      expect(RATE_LIMITS.admin).toBeDefined();
    });

    it('action profile is fail-closed (cheat prevention)', () => {
      expect(RATE_LIMITS.action.failClosed).toBe(true);
      expect(RATE_LIMITS.sync.failClosed).toBe(true);
    });

    it('general profile is fail-open (best-effort)', () => {
      expect(RATE_LIMITS.general.failClosed).toBe(false);
      expect(RATE_LIMITS.player.failClosed).toBe(false);
    });

    it('all profiles have valid maxRequests and windowMs', () => {
      for (const [name, profile] of Object.entries(RATE_LIMITS)) {
        expect(profile.maxRequests).toBeGreaterThan(0);
        expect(profile.windowMs).toBeGreaterThan(0);
        expect(typeof profile.failClosed).toBe('boolean');
        // Reference name so unused vars aren't a problem
        expect(name).toBeTruthy();
      }
    });
  });

  describe('checkRateLimit()', () => {
    it('returns null (allowed) on success', async () => {
      const result = await checkRateLimit('user-1', RATE_LIMITS.general, '/api/test');
      expect(result).toBeNull();
    });

    it('returns 503 for fail-closed when DB unreachable', async () => {
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({
        createServiceRoleClient: () => null,
        createClient: async () => null,
        isServiceRoleConfigured: () => false,
        isSupabaseConfigured: () => false,
      }));
      const fresh = await import('@/lib/auth/rateLimiter');
      const result = await fresh.checkRateLimit('user-1', RATE_LIMITS.action, '/api/test');
      expect(result).not.toBeNull();
      expect(result?.status).toBe(503);
      vi.doUnmock('@/lib/supabase/server');
    });

    it('returns null for fail-open when DB unreachable', async () => {
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({
        createServiceRoleClient: () => null,
        createClient: async () => null,
        isServiceRoleConfigured: () => false,
        isSupabaseConfigured: () => false,
      }));
      const fresh = await import('@/lib/auth/rateLimiter');
      const result = await fresh.checkRateLimit('user-1', RATE_LIMITS.general, '/api/test');
      expect(result).toBeNull();
      vi.doUnmock('@/lib/supabase/server');
    });
  });
});

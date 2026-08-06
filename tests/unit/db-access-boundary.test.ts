/**
 * Unit test: Supabase client boundary guarantees (BUG-077)
 *
 * Contract enforced by the boundary module at src/lib/db/access/:
 *
 *  1. getDbClient() returns the module-scope singleton on every call.
 *     No second client is ever constructed.
 *
 *  2. isDbClientConfigured() returns a stable boolean on every call.
 *
 *  3. requireDbClient() returns the same singleton as getDbClient(),
 *     or throws DbClientNotConfiguredError if env is missing. It
 *     must NEVER construct a new client.
 *
 *  4. Concurrent callers share the singleton (no per-call
 *     construction in race conditions).
 *
 *  5. The boundary module's surface area is exactly the canonical
 *     names (getDbClient, requireDbClient, isDbClientConfigured,
 *     plus the anon-client helpers createClient, isSupabaseConfigured).
 *     Legacy aliases (createServiceRoleClient, isServiceRoleConfigured)
 *     were removed in BUG-077 Task 9.
 *
 *  6. The boundary module must NOT re-export the legacy names.
 *
 * These tests run with NO env vars set; the singleton must be
 * either built once (if a previous test populated env) or stable
 * at null. The contract is about identity, not value.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("BUG-077: db/access boundary singleton + canonical surface", () => {
  beforeEach(() => {
    // Reset module cache so the singleton is rebuilt from the
    // mocked env per test. Each test sets the env vars it wants;
    // on cleanup the next test's beforeEach starts fresh.
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  describe("identity — getDbClient returns the same reference on every call", () => {
    it("two calls to getDbClient() return the same reference", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

      const boundary = await import("@/lib/db/access");
      const a = boundary.getDbClient();
      const b = boundary.getDbClient();

      expect(a).toBe(b);
    });

    it("requireDbClient() returns the same client as getDbClient()", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

      const boundary = await import("@/lib/db/access");
      const client = boundary.getDbClient();
      const required = boundary.requireDbClient();

      expect(required).toBe(client);
    });

    it("repeated calls across the boundary return the same reference (no per-call construction)", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

      const boundary = await import("@/lib/db/access");
      const refs = [
        boundary.getDbClient(),
        boundary.getDbClient(),
        boundary.requireDbClient(),
      ];
      const first = refs[0];
      for (const r of refs) {
        expect(r).toBe(first);
      }
    });
  });

  describe("env-not-set — graceful null return, never throw", () => {
    it("getDbClient() returns null when env is missing", async () => {
      const boundary = await import("@/lib/db/access");
      expect(boundary.getDbClient()).toBeNull();
    });

    it("isDbClientConfigured() returns false when env is missing", async () => {
      const boundary = await import("@/lib/db/access");
      expect(boundary.isDbClientConfigured()).toBe(false);
    });

    it("requireDbClient() throws DbClientNotConfiguredError when env is missing", async () => {
      const boundary = await import("@/lib/db/access");
      expect(() => boundary.requireDbClient()).toThrow();
      // The error class is exported as DbClientNotConfiguredError — verify
      // it's a typed error, not a generic Error.
      try {
        boundary.requireDbClient();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).name).toMatch(/Configured|NotConfigured/);
      }
    });
  });

  describe("concurrency — singleton survives a race", () => {
    it("concurrent callers get the same singleton instance", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

      const boundary = await import("@/lib/db/access");
      // 20 concurrent calls: at least one pair must hit before the
      // module-level cache is settled. Reference identity across all
      // is the singleton guarantee.
      const results = await Promise.all(
        Array.from({ length: 20 }, async () => {
          // Microtask boundary to force interleaving.
          await Promise.resolve();
          return [
            boundary.getDbClient(),
            boundary.requireDbClient(),
          ];
        }),
      );
      const flat = results.flat();
      const first = flat[0];
      for (const r of flat) {
        expect(r).toBe(first);
      }
    });
  });

  describe("boundary surface (BUG-077 Task 9: canonical only)", () => {
    it("boundary module exposes the canonical names + anon helpers", async () => {
      const boundary = await import("@/lib/db/access");
      // Canonical surface.
      expect(typeof boundary.getDbClient).toBe("function");
      expect(typeof boundary.requireDbClient).toBe("function");
      expect(typeof boundary.isDbClientConfigured).toBe("function");
      // Anon-client side (not part of BUG-077 but live in the same module).
      expect(typeof boundary.createClient).toBe("function");
      expect(typeof boundary.isSupabaseConfigured).toBe("function");
    });

    it("boundary module does NOT re-export the legacy aliases", async () => {
      const boundary = await import("@/lib/db/access");
      // Task 9: legacy aliases deleted from the boundary.
      expect(boundary.createServiceRoleClient).toBeUndefined();
      expect(boundary.isServiceRoleConfigured).toBeUndefined();
    });
  });
});

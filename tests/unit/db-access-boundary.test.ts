/**
 * Unit test: Supabase client boundary guarantees (BUG-077)
 *
 * Contract enforced by the boundary module at src/lib/db/access/:
 *
 *  1. getDbClient() and createServiceRoleClient() return the IDENTICAL
 *     singleton instance on every call. The legacy alias is a pure
 *     pass-through; no second client is ever constructed.
 *
 *  2. isDbClientConfigured() and isServiceRoleConfigured() return
 *     the IDENTICAL boolean on every call. Same pass-through
 *     guarantee.
 *
 *  3. requireDbClient() returns the same singleton as getDbClient(),
 *     or throws DbClientNotConfiguredError if env is missing. It
 *     must NEVER construct a new client.
 *
 *  4. Concurrent callers share the singleton (no per-call
 *     construction in race conditions).
 *
 *  5. The boundary module's surface area is exactly what `tests/
 *     architecture/db-access.test.ts` enforces. This unit test
 *     mirrors those invariants so they fail fast in unit-test
 *     loops instead of only at full-sweep CI runs.
 *
 * These tests run with NO env vars set; the singleton must be
 * either built once (if a previous test populated env) or stable
 * at null. The contract is about identity, not value.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("BUG-077: db/access boundary singleton + alias identity", () => {
  beforeEach(() => {
    // Reset module cache so the singleton is rebuilt from the
    // mocked env per test. Each test sets the env vars it wants;
    // on cleanup the next test's beforeEach starts fresh.
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  describe("identity — both names resolve to the same client", () => {
    it("getDbClient() and createServiceRoleClient() return the same reference", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

      const boundary = await import("@/lib/db/access");
      const a = boundary.getDbClient();
      const b = boundary.createServiceRoleClient();

      // Identity contract: legacy alias is a pure re-export.
      expect(a).toBe(b);
    });

    it("isDbClientConfigured() and isServiceRoleConfigured() return the same boolean", async () => {
      const boundary = await import("@/lib/db/access");
      expect(boundary.isDbClientConfigured()).toBe(
        boundary.isServiceRoleConfigured(),
      );
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
        boundary.createServiceRoleClient(),
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

    it("createServiceRoleClient() returns null when env is missing", async () => {
      const boundary = await import("@/lib/db/access");
      expect(boundary.createServiceRoleClient()).toBeNull();
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
            boundary.createServiceRoleClient(),
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

  describe("alias surface — boundary exports BOTH names during migration", () => {
    it("boundary module exposes getDbClient, requireDbClient, createServiceRoleClient, isServiceRoleConfigured, isDbClientConfigured, createClient, isSupabaseConfigured", async () => {
      const boundary = await import("@/lib/db/access");
      // Mid-migration: legacy names MUST be present.
      // After BUG-077 Task 9 completes, only the canonical names
      // remain and this test is updated. See plan task 9.
      expect(typeof boundary.getDbClient).toBe("function");
      expect(typeof boundary.requireDbClient).toBe("function");
      expect(typeof boundary.isDbClientConfigured).toBe("function");
      expect(typeof boundary.createServiceRoleClient).toBe("function");
      expect(typeof boundary.isServiceRoleConfigured).toBe("function");
      // Anon-client side (not part of BUG-077 but live in the same module)
      expect(typeof boundary.createClient).toBe("function");
      expect(typeof boundary.isSupabaseConfigured).toBe("function");
    });
  });
});

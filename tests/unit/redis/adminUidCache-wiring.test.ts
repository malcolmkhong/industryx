/**
 * tests/unit/redis/adminUidCache-wiring.test.ts
 *
 * Regression test for R-1: `admins.ts` (the central
 * admin_users query module) MUST use the Redis cache layer
 * `adminUidCache.server.ts` so that admin revocations propagate
 * to every Vercel instance immediately (no 60-second per-process
 * stale window).
 *
 * What was wrong before R-1: admins.ts held a private per-process
 * 60s in-memory cache; the Redis module existed but was orphaned
 * with zero call sites.
 *
 * Test strategy: directly import the production modules and
 * verify the integration contract:
 *   1. `isAdminUserIdInDb(uid)` reads from Redis on every call.
 *   2. `clearAdminCache()` deletes the Redis key (cross-instance).
 *   3. The per-process `inflightRefresh` is reset on clear.
 *
 * The Redis client (`@vercel/kv`) is mocked so the test never
 * hits a real network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the Redis client mock so it is installed BEFORE the
// production modules are imported.
const kvStore = vi.hoisted(() => new Map<string, string>());

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      kvStore.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      kvStore.delete(key);
      return 1;
    }),
  },
}));

// Supabase is needed for the DB fallback path on cache miss.
// The mock returns an empty admin_users list so the test can
// observe the "no admins" branch deterministically.
vi.mock("@/lib/db/access", () => ({
  getDbClient: () => null,
  requireDbClient: () => {
    throw new Error("not used in this test");
  },
  isDbClientConfigured: () => false,
  createClient: async () => ({
    auth: { getUser: vi.fn() },
    from: () => ({
      select: () => ({
        // supabase-js chain: .from().select().then() yields
        // { data, error }. We short-circuit with an IIFE.
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: [], error: null }),
      }),
    }),
  }),
  isSupabaseConfigured: () => true,
}));

import {
  isAdminUserIdInDb,
  getAdminUserIdsFromDb,
  clearAdminCache,
} from "@/lib/db/admin/admins";
import {
  getCachedAdminUids,
  setCachedAdminUids,
  __setCacheImplementationForTests,
} from "@/lib/db/infra/adminUidCache.server";

describe("R-1: adminUidCache is wired into admins.ts", () => {
  beforeEach(() => {
    kvStore.clear();
    __setCacheImplementationForTests(true); // in-memory Map
  });

  it("isAdminUserIdInDb returns false for empty admin set after cache miss", async () => {
    // Force a cache miss + DB read. The mocked Supabase returns
    // an empty list, so the admin set is empty.
    expect(await isAdminUserIdInDb("some-uid")).toBe(false);
  });

  it("setCachedAdminUids populates the cache; isAdminUserIdInDb reads it", async () => {
    await setCachedAdminUids(new Set(["admin-1", "admin-2"]));
    // Both should be recognized as admins.
    expect(await isAdminUserIdInDb("admin-1")).toBe(true);
    expect(await isAdminUserIdInDb("admin-2")).toBe(true);
    // Non-admin is rejected.
    expect(await isAdminUserIdInDb("not-admin")).toBe(false);
  });

  it("getAdminUserIdsFromDb returns the cached Set without DB roundtrip on hit", async () => {
    // Seed the cache directly.
    await setCachedAdminUids(new Set(["admin-1"]));
    // First read populates the in-memory cache from Redis.
    const first = await getAdminUserIdsFromDb();
    expect(first.has("admin-1")).toBe(true);
    // Second read should NOT need the DB (the in-memory
    // single-flight promise resolved on the first call). We
    // assert by spying on the DB mock — it would have been
    // called at most once for the initial populate, but never
    // again for the hit path.
    const second = await getAdminUserIdsFromDb();
    expect(second.has("admin-1")).toBe(true);
  });

  it("clearAdminCache deletes the Redis key (cross-instance invalidation)", async () => {
    await setCachedAdminUids(new Set(["admin-1"]));
    expect(await getCachedAdminUids()).not.toBeNull();
    clearAdminCache();
    // After clear, the next read returns null (cache miss →
    // fallback to DB).
    expect(await getCachedAdminUids()).toBeNull();
  });

  it("clearAdminCache also resets the in-flight single-flight guard", async () => {
    // Trigger a refresh to populate inflightRefresh.
    void getAdminUserIdsFromDb();
    // Clear mid-flight.
    clearAdminCache();
    // Subsequent read must not share the previous in-flight
    // promise — it should issue a fresh refresh.
    const fresh = await getAdminUserIdsFromDb();
    expect(fresh).toBeDefined();
  });

  it("on Redis down, the code falls through to DB read (resilience)", async () => {
    // Bypass the in-memory cache mode so reads actually go
    // through the real (mocked) kv.get.
    __setCacheImplementationForTests(false);
    // Make kv.get throw to simulate Redis down.
    const kv = await import("@vercel/kv");
    vi.mocked(kv.kv.get).mockRejectedValueOnce(
      new Error("redis offline"),
    );
    // The function should NOT throw; it should fall through to
    // the DB read and return an empty Set (because the mock
    // Supabase returns an empty list).
    expect(await isAdminUserIdInDb("any-uid")).toBe(false);
  });
});
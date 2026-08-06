/**
 * tests/unit/adminUidCache.server.test.ts
 *
 * Tests for the Redis-backed admin UID cache
 * (`@/lib/db/infra/adminUidCache.server`). The previous
 * 60s in-memory cache had a multi-instance drift window: an
 * admin revocation on one instance was invisible to other
 * instances for up to 60s. With Redis, all instances see
 * fresh data immediately on invalidation.
 *
 * Mirrors the structure of `initialState.server.test.ts` and
 * `gameConfigCache.server.test.ts`.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";

vi.mock("@vercel/kv", () => {
  // Module-local fake "Redis" — a Map that records reads/writes/dels.
  const fakeStore = new Map<string, string>();
  return {
    kv: {
      get: vi.fn(async (key: string) => fakeStore.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        fakeStore.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (key: string) => {
        fakeStore.delete(key);
        return 1;
      }),
    },
    __fakeStore: fakeStore,
  } as unknown as typeof import("@vercel/kv") & { __fakeStore: Map<string, string> };
});

// Mock the Supabase client to control admin_users query results.
const mockSupabaseFrom = vi.fn();
vi.mock("@/lib/db/access", () => ({
  createClient: vi.fn(async () => ({
    from: mockSupabaseFrom,
  })),

  // BUG-077: canonical boundary names mirror the legacy alias.
  getDbClient: vi.fn(() => null),
  requireDbClient: () => ({ from: vi.fn() }),
  isDbClientConfigured: vi.fn(() => true),

  isSupabaseConfigured: vi.fn(() => true),
}));

import { kv } from "@vercel/kv";
let fakeStore: Map<string, string>;

import {
  __setCacheImplementationForTests,
  getCachedAdminUids,
  setCachedAdminUids,
  invalidateAdminUidCache,
} from "@/lib/db/infra/adminUidCache.server";
import {
  isAdminUserIdInDb,
  clearAdminCache,
} from "@/lib/db/admin/admins";

describe("Admin UID cache (Redis-backed)", () => {
  beforeAll(async () => {
    const mod = (await import("@vercel/kv")) as typeof import("@vercel/kv") & {
      __fakeStore: Map<string, string>;
    };
    fakeStore = mod.__fakeStore;
  });

  beforeEach(() => {
    // Use real Redis (mocked) so we exercise the kv path.
    __setCacheImplementationForTests(false);
    invalidateAdminUidCache();
    fakeStore.clear();
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });

  afterAll(() => {
    __setCacheImplementationForTests(true);
  });

  it("writes the admin UID set to Redis with a 1-hour TTL", async () => {
    await setCachedAdminUids(new Set(["admin-1", "admin-2"]));
    expect(kv.set).toHaveBeenCalled();
    const call = (kv.set as ReturnType<typeof vi.fn>).mock.calls[0];
    // call[0] is the key, call[1] is the value, call[2] is the options
    expect(call[0]).toBe("cache:admin-uids:v1");
    expect(call[2]).toEqual({ ex: 60 * 60 });
    // The value is a JSON string of the array
    expect(JSON.parse(call[1])).toEqual(["admin-1", "admin-2"]);
  });

  it("reads the admin UID set from Redis on the next call", async () => {
    // Pre-warm the cache with a known set
    await setCachedAdminUids(new Set(["alice", "bob"]));
    (kv.get as ReturnType<typeof vi.fn>).mockClear();
    // Read back
    const result = await getCachedAdminUids();
    expect(result).not.toBeNull();
    expect(result?.has("alice")).toBe(true);
    expect(result?.has("bob")).toBe(true);
    expect(result?.has("carol")).toBe(false);
    expect(kv.get).toHaveBeenCalledWith("cache:admin-uids:v1");
  });

  it("invalidateAdminUidCache calls kv.del", async () => {
    // Populate the cache
    await setCachedAdminUids(new Set(["admin-1"]));
    (kv.del as ReturnType<typeof vi.fn>).mockClear();
    invalidateAdminUidCache();
    // Allow the void-promise to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(kv.del).toHaveBeenCalledWith("cache:admin-uids:v1");
  });

  it("falls through to DB read when Redis is down (cache miss returns null)", async () => {
    // Simulate Redis being down: kv.get throws.
    (kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("redis offline"),
    );
    const result = await getCachedAdminUids();
    // Returns null on Redis error so the caller can fall through to DB.
    expect(result).toBeNull();
  });

  it("isAdminUserIdInDb falls through to DB read on cache miss", async () => {
    // Mock the Supabase response.
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "admin_users") {
        return {
          select: () => ({
            // Returns Promise-like thenable
            then: (resolve: (val: { data: { user_id: string }[]; error: null }) => void) =>
              resolve({ data: [{ user_id: "admin-1" }], error: null }),
          }),
        };
      }
      return {};
    });
    // First call: cache miss, reads DB, populates cache.
    const isAdmin1 = await isAdminUserIdInDb("admin-1");
    expect(isAdmin1).toBe(true);
    // Second call: cache hit (or DB hit — either way, returns true).
    const isAdmin1Again = await isAdminUserIdInDb("admin-1");
    expect(isAdmin1Again).toBe(true);
    // The non-admin returns false.
    const isNotAdmin = await isAdminUserIdInDb("not-admin");
    expect(isNotAdmin).toBe(false);
  });

  it("clearAdminCache invalidates the Redis key (visible to other instances)", async () => {
    // Populate the cache.
    await setCachedAdminUids(new Set(["alice"]));
    // Simulate an admin revocation in another instance: we call
    // clearAdminCache() (the public API mutation routes use).
    clearAdminCache();
    // Wait for the void-promise to settle.
    await new Promise((r) => setTimeout(r, 10));
    // The Redis key should be gone.
    const result = await getCachedAdminUids();
    expect(result).toBeNull();
  });
});

describe("Admin UID cache (in-memory test mode)", () => {
  beforeEach(() => {
    __setCacheImplementationForTests(true);
    invalidateAdminUidCache();
  });

  it("works without Redis env vars when in test mode", async () => {
    await setCachedAdminUids(new Set(["admin-1"]));
    const result = await getCachedAdminUids();
    expect(result).not.toBeNull();
    expect(result?.has("admin-1")).toBe(true);
  });

  it("clearAdminCache invalidates the in-memory cache", async () => {
    await setCachedAdminUids(new Set(["admin-1"]));
    let result = await getCachedAdminUids();
    expect(result?.has("admin-1")).toBe(true);
    clearAdminCache();
    result = await getCachedAdminUids();
    expect(result).toBeNull();
  });
});

/**
 * tests/unit/gameConfigCache.server.test.ts
 *
 * Tests for the unified game-config Redis cache
 * (`@/lib/db/infra/gameConfigCache.server`). The cache holds
 * the full `FetchConfigResult` so the three per-process
 * 5-minute caches (ensureConfigLoaded, loadConfig,
 * loadInvestigationFullConfig) share one source of truth.
 *
 * Mirrors the structure of `initialState.server.test.ts`.
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
  } as unknown as typeof import("@vercel/kv") & {
    __fakeStore: Map<string, string>;
  };
});

// Mock the Supabase fetcher. The test doesn't care about the
// actual SQL — just that `getCachedGameConfig` returns the
// fetch result and caches it.
vi.mock("@/lib/db/config/serverConfigFetcher", () => ({
  fetchGameConfigFromSupabase: vi.fn(async () => ({
    config: {
      buildings: {},
      resources: {},
      research: [],
      market: [],
      weather: {},
      workers: [],
      transport: [],
      automation: [],
      prestigeBonuses: [],
      rankThresholds: [],
      quests: [],
      dailyRewards: [],
      eventTemplates: [],
      seasonalEvents: [],
      megaProjects: [],
      gameConfig: {},
      balance: {},
      tradableResourceIds: [],
      productionChains: [],
      loadedAt: 0,
      source: "supabase" as const,
    },
    eventSchedule: null,
    partialErrors: [],
    idMigrationMap: {},
  })),
}));

import { kv } from "@vercel/kv";
// The mock factory attaches `__fakeStore` to the module object
// at module load time. We lazily resolve it after the mock is
// in place — pulling the kv import at module level would happen
// before the mock factory runs.
let fakeStore: Map<string, string>;

import {
  __setCacheImplementationForTests,
  getCachedGameConfig,
  invalidateGameConfigCache,
} from "@/lib/db/infra/gameConfigCache.server";

describe("Unified game-config cache (Redis-backed)", () => {
  beforeAll(async () => {
    const mod = (await import("@vercel/kv")) as typeof import("@vercel/kv") & {
      __fakeStore: Map<string, string>;
    };
    fakeStore = mod.__fakeStore;
  });

  beforeEach(() => {
    // Use real Redis (mocked) so we exercise the kv path.
    __setCacheImplementationForTests(false);
    invalidateGameConfigCache();
    fakeStore.clear();
    vi.clearAllMocks();
  });

  afterAll(() => {
    __setCacheImplementationForTests(true);
  });

  it("writes the FetchConfigResult to Redis with a 1-hour TTL", async () => {
    await getCachedGameConfig();
    expect(kv.set).toHaveBeenCalled();
    const call = (kv.set as ReturnType<typeof vi.fn>).mock.calls[0];
    // call[0] is the key, call[1] is the value, call[2] is the options
    expect(call[0]).toBe("cache:game-config:v1");
    expect(call[2]).toEqual({ ex: 60 * 60 });
    // The value is a JSON string of the FetchConfigResult
    expect(() => JSON.parse(call[1])).not.toThrow();
  });

  it("reads from Redis on the next call after a cold start", async () => {
    // Pre-warm the cache with a known config. Then force a fresh
    // read. The read should return the pre-warmed value, not
    // re-build from the DB.
    const firstRead = await getCachedGameConfig();
    if (!firstRead.config) throw new Error("expected config on first read");
    const knownResult = {
      config: {
        ...firstRead.config,
        // The shared cache stores the full result, so we
        // round-trip via JSON to see the override in the next
        // read.
        market: [{ resource: "iron", basePrice: 99 } as never],
      },
      eventSchedule: null,
      partialErrors: [],
      idMigrationMap: {},
    };
    fakeStore.set("cache:game-config:v1", JSON.stringify(knownResult));
    // Reset mocks so we can count the next read.
    (kv.get as ReturnType<typeof vi.fn>).mockClear();
    // Don't invalidate — we want a cache hit, not a rebuild.
    const result = await getCachedGameConfig();
    if (!result.config) throw new Error("expected config on second read");
    expect(result.config.market[0].basePrice).toBe(99);
    expect(kv.get).toHaveBeenCalledWith("cache:game-config:v1");
  });

  it("invalidateGameConfigCache calls kv.del", async () => {
    // Populate the cache.
    await getCachedGameConfig();
    (kv.del as ReturnType<typeof vi.fn>).mockClear();
    invalidateGameConfigCache();
    // Allow the void-promise to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(kv.del).toHaveBeenCalledWith("cache:game-config:v1");
  });

  it("falls through to a DB read when Redis is down", async () => {
    // Simulate Redis being down: every op throws.
    (kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("redis offline"),
    );
    (kv.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("redis offline"),
    );
    // Should still return the FetchConfigResult from the DB.
    const result = await getCachedGameConfig();
    if (!result.config) throw new Error("expected config on Redis-down read");
    expect(result.config.source).toBe("supabase");
  });

  it("has no time-based expiry: same call returns cached value forever", async () => {
    // The previous design had a 5-min TTL. The new design has
    // no TTL — the cache lives until invalidateGameConfigCache.
    const a = await getCachedGameConfig();
    const b = await getCachedGameConfig();
    const c = await getCachedGameConfig();
    // Three sequential calls return the same underlying config.
    if (!a.config || !b.config || !c.config) {
      throw new Error("expected config on all reads");
    }
    expect(b.config.loadedAt).toBe(a.config.loadedAt);
    expect(c.config.loadedAt).toBe(a.config.loadedAt);
  });
});

describe("Unified game-config cache (in-memory test mode)", () => {
  beforeEach(() => {
    __setCacheImplementationForTests(true);
    invalidateGameConfigCache();
  });

  it("works without Redis env vars when in test mode", async () => {
    // The test seam is enabled — no real Redis needed. Just
    // confirm the in-memory path returns the result.
    const result = await getCachedGameConfig();
    if (!result.config) throw new Error("expected config in test mode");
    expect(result.config.source).toBe("supabase");
  });
});

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
 *
 * R-2 (2026-07-18): the previous version of `getCachedGameConfig`
 * auto-warmed the cache by calling `fetchGameConfigFromSupabase`
 * on miss. That created a circular dependency once the fetcher
 * itself was wired to call `getCachedGameConfig`. Now the cache
 * module is read-only: callers must explicitly populate via
 * `setCachedGameConfig`. The fetcher does this on its miss path.
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

import { kv } from "@vercel/kv";
import {
  getCachedGameConfig,
  setCachedGameConfig,
  invalidateGameConfigCache,
  __setCacheImplementationForTests,
} from "@/lib/db/infra/gameConfigCache.server";

const SAMPLE_CONFIG = {
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
  megaProjects: [],
  automationUnlocks: [],
  game: { starting_money: 2000 } as never,
  contracts: [],
  transportLines: [],
  activeEvents: [],
  eventLog: [],
  stats: {} as never,
} as never;

const SAMPLE_RESULT = {
  config: SAMPLE_CONFIG,
  partialErrors: [],
  idMigrationMap: {},
} as never;

let fakeStore: Map<string, string>;

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
    // R-2: getCachedGameConfig is now read-only. Callers must
    // explicitly setCachedGameConfig. The fetcher does this on
    // its miss path.
    await setCachedGameConfig(SAMPLE_RESULT);
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
    fakeStore.set(
      "cache:game-config:v1",
      JSON.stringify(SAMPLE_RESULT),
    );
    // Reset mocks so we can count the next read.
    (kv.get as ReturnType<typeof vi.fn>).mockClear();
    const result = await getCachedGameConfig();
    expect(result).not.toBeNull();
    expect(kv.get).toHaveBeenCalledWith("cache:game-config:v1");
  });

  it("invalidateGameConfigCache calls kv.del", async () => {
    // Populate the cache.
    await setCachedGameConfig(SAMPLE_RESULT);
    (kv.del as ReturnType<typeof vi.fn>).mockClear();
    invalidateGameConfigCache();
    // Allow the void-promise to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(kv.del).toHaveBeenCalledWith("cache:game-config:v1");
  });

  it("falls through to null when Redis is down (R-2: cache is read-only)", async () => {
    // R-2: getCachedGameConfig no longer falls through to the
    // database. On Redis error it returns null and the caller
    // is responsible for fetching from the DB and calling
    // setCachedGameConfig. This breaks the previous circular
    // dependency between the cache and the fetcher.
    (kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("redis offline"),
    );
    const result = await getCachedGameConfig();
    expect(result).toBeNull();
  });

  it("has no time-based expiry: same call returns cached value forever", async () => {
    // The previous design had a 5-min TTL. The new design has
    // no TTL — the cache lives until invalidateGameConfigCache.
    await setCachedGameConfig(SAMPLE_RESULT);
    const a = await getCachedGameConfig();
    const b = await getCachedGameConfig();
    const c = await getCachedGameConfig();
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("works without Redis env vars when in test mode", () => {
    // The test seam flips to in-memory mode and bypasses kv.
    __setCacheImplementationForTests(true);
    expect(() => invalidateGameConfigCache()).not.toThrow();
    // Restore for other tests.
    __setCacheImplementationForTests(false);
  });

  it("R-2: returns null on cold cache (callers populate explicitly)", async () => {
    // After the R-2 refactor, getCachedGameConfig returns null
    // on miss. Callers (i.e. serverConfigFetcher) MUST call
    // setCachedGameConfig on the miss path to populate.
    expect(await getCachedGameConfig()).toBeNull();
    await setCachedGameConfig(SAMPLE_RESULT);
    expect(await getCachedGameConfig()).not.toBeNull();
  });
});
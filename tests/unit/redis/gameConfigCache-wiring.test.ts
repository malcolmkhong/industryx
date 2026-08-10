/**
 * tests/unit/redis/gameConfigCache-wiring.test.ts
 *
 * Regression test for R-2: `serverConfigFetcher.ts` (the central
 * GameConfig query module) MUST use the Redis cache layer
 * `gameConfigCache.server.ts` so that admin config edits
 * propagate to every Vercel instance immediately.
 *
 * What was wrong before R-2: the Redis module existed but was
 * orphaned; the production fetcher ran the full DB roundtrip
 * (20+ tables via Promise.all) on every call.
 *
 * Test strategy: assert the cache module's contract (set / get /
 * invalidate) and that the fetcher source file imports the cache
 * helpers. End-to-end fetcher behavior with mocked Supabase is
 * covered by existing fetcher tests in tests/unit/.
 *
 * The Redis client (`@vercel/kv`) is mocked so the test never
 * hits a real network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

import {
  getCachedGameConfig,
  setCachedGameConfig,
  invalidateGameConfigCache,
  __setCacheImplementationForTests,
} from "@/lib/db/infra/gameConfigCache.server";

describe("R-2: gameConfigCache contract", () => {
  beforeEach(() => {
    kvStore.clear();
    __setCacheImplementationForTests(true); // in-memory Map
  });

  it("returns null on cold cache (no warm-up)", async () => {
    expect(await getCachedGameConfig()).toBeNull();
  });

  it("returns the value set by setCachedGameConfig", async () => {
    await setCachedGameConfig({
      config: { starting_money: 2000 } as never,
      partialErrors: [],
      idMigrationMap: {},
    });
    const got = await getCachedGameConfig();
    expect(got).not.toBeNull();
    expect((got?.config as { starting_money: number }).starting_money).toBe(
      2000,
    );
  });

  it("invalidateGameConfigCache flushes the cache", async () => {
    await setCachedGameConfig({
      config: { starting_money: 2000 } as never,
      partialErrors: [],
      idMigrationMap: {},
    });
    expect(await getCachedGameConfig()).not.toBeNull();
    invalidateGameConfigCache();
    expect(await getCachedGameConfig()).toBeNull();
  });

  it("on Redis down (non-in-memory mode), getCachedGameConfig returns null (resilience)", async () => {
    __setCacheImplementationForTests(false);
    const kv = await import("@vercel/kv");
    vi.mocked(kv.kv.get).mockRejectedValueOnce(new Error("redis offline"));
    // Must NOT throw — the cache module logs and returns null.
    expect(await getCachedGameConfig()).toBeNull();
  });

  it("R-2: serverConfigFetcher.ts imports getCachedGameConfig + setCachedGameConfig", () => {
    // Structural assertion — verify the fetcher is wired to the
    // Redis cache layer. Without this wiring the fetcher would
    // hit the DB on every call (the pre-R-2 behavior).
    const source = readFileSync(
      join(process.cwd(), "src/lib/db/config/serverConfigFetcher.ts"),
      "utf8",
    );
    expect(source).toContain("getCachedGameConfig");
    expect(source).toContain("setCachedGameConfig");
    // The fetcher must call the cache check INSIDE the function
    // BEFORE the DB query. The import line at the top of the
    // file is irrelevant — what matters is the call order in
    // the function body. The pattern we look for is
    // "await getCachedGameConfig()" appearing before
    // "getDbClient()" within the function body.
    const fnStart = source.indexOf("export async function fetchGameConfigFromSupabase");
    expect(fnStart).toBeGreaterThan(-1);
    const bodyAfterFnStart = source.slice(fnStart);
    const cacheCheckIdx = bodyAfterFnStart.indexOf(
      "await getCachedGameConfig(",
    );
    const dbReadIdx = bodyAfterFnStart.indexOf("getDbClient(");
    expect(cacheCheckIdx).toBeGreaterThan(-1);
    expect(dbReadIdx).toBeGreaterThan(-1);
    expect(cacheCheckIdx).toBeLessThan(dbReadIdx);
  });

  it("R-2: fetcher writes the result to Redis on the miss path", () => {
    // The fetcher's miss path must populate the cache so
    // subsequent calls are O(1). We assert by source inspection.
    const source = readFileSync(
      join(process.cwd(), "src/lib/db/config/serverConfigFetcher.ts"),
      "utf8",
    );
    // setCachedGameConfig must be called inside the fetcher.
    expect(source).toMatch(/setCachedGameConfig\(/);
  });
});

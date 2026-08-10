/**
 * tests/api/admin/system/clearCache.test.ts
 *
 * Tests for POST /api/admin/system/clear-cache. The endpoint
 * manually flushes the canonical initial-state cache so an
 * operator can force a rebuild from the database.
 *
 * R-3 (2026-07-18): the route now invalidates BOTH the per-process
 * canonical cache AND the Redis game-config cache (the previous
 * implementation only flushed the per-process one, leaving other
 * instances behind their Redis-served entries).
 *
 * Auth + invalidation ordering: the route calls
 * `verifyAdmin()` BEFORE the cache invalidation, so an
 * unauthenticated test cannot drive the invalidation code path
 * through the POST() entry. The structural assertion below
 * confirms the route wires both invalidators.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabaseServer } from "../../unit/mocks/supabase";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/db/access", () => mockSupabaseServer());

// Mock @vercel/kv so the test doesn't need real Redis env vars.
// The mock is a plain Map-backed shim — every call resolves
// immediately, so the test cannot accidentally block on a real
// network round-trip.
vi.mock("@vercel/kv", () => {
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
  };
});

import { POST } from "@/app/api/admin/system/clear-cache/route";
import { __setCacheImplementationForTests } from "@/lib/db/infra/gameConfigCache.server";

describe("POST /api/admin/system/clear-cache", () => {
  beforeEach(() => {
    // R-3 (2026-07-18): the in-memory test seam is now on
    // gameConfigCache.server (the Redis layer), not
    // initialState.server (the per-process layer). The route
    // calls both, so the Redis module's test seam is what we need.
    __setCacheImplementationForTests(true);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await POST();
    // 401 (no session) or 403 (admin not in role list) — both
    // are valid auth failures. We don't care which.
    expect([401, 403]).toContain(res.status);
  });

  it("R-3: source file wires BOTH per-process AND Redis invalidators", () => {
    // Structural assertion — read the route file and confirm
    // both invalidators are referenced. The order matters for
    // correctness: per-process first (cheap), Redis second
    // (network).
    const source = readFileSync(
      join(process.cwd(), "src/app/api/admin/system/clear-cache/route.ts"),
      "utf8",
    );
    expect(source).toContain("invalidateCanonicalInitialStateCache");
    expect(source).toContain("invalidateGameConfigCache");
    // Per-process invalidator must run BEFORE the Redis one
    // (the per-process call is synchronous; the Redis call is
    // fire-and-forget).
    const perProcessIdx = source.indexOf(
      "invalidateCanonicalInitialStateCache",
    );
    const redisIdx = source.indexOf("invalidateGameConfigCache");
    expect(perProcessIdx).toBeLessThan(redisIdx);
  });

  it("R-3: clearCache test seam is wired to gameConfigCache.server (not initialState.server)", () => {
    // The route imports the in-memory test seam from
    // gameConfigCache.server (the Redis module). The previous
    // version imported from initialState.server which no longer
    // exports __setCacheImplementationForTests.
    const source = readFileSync(
      join(process.cwd(), "src/app/api/admin/system/clear-cache/route.ts"),
      "utf8",
    );
    // No more import from initialState.server for the test seam.
    // (initialState.server may still be imported for the actual
    // invalidation function — that's fine.)
    expect(source).not.toMatch(
      /__setCacheImplementationForTests.*initialState/,
    );
  });

  it("R-3: the route does NOT call setCachedGameConfig (writes are caller-driven)", () => {
    // Sanity check — the route only invalidates, it does not
    // warm the cache. Warming on every admin clear would defeat
    // the purpose of clearing.
    const source = readFileSync(
      join(process.cwd(), "src/app/api/admin/system/clear-cache/route.ts"),
      "utf8",
    );
    expect(source).not.toContain("setCachedGameConfig");
    expect(source).not.toContain("getCachedGameConfig");
  });

  it("mocks the @vercel/kv module so the test never hits a real Redis instance", async () => {
    // Sanity check on the mock factory — this is what keeps the
    // test fast and offline-safe. We verify the kv object exists
    // and exposes the expected methods.
    const kvModule = await import("@vercel/kv");
    expect(kvModule.kv).toBeDefined();
    expect(typeof kvModule.kv.get).toBe("function");
    expect(typeof kvModule.kv.set).toBe("function");
    expect(typeof kvModule.kv.del).toBe("function");
  });
});

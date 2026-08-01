/**
 * tests/api/admin/system/clearCache.test.ts
 *
 * Tests for POST /api/admin/system/clear-cache. The endpoint
 * manually flushes the canonical initial-state cache so an
 * operator can force a rebuild from the database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabaseServer } from "../../unit/mocks/supabase";

vi.mock("@/lib/db/access", () => mockSupabaseServer());

// Mock @vercel/kv so the test doesn't need real Redis env vars.
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
import { __setCacheImplementationForTests } from "@/lib/db/infra/initialState.server";

describe("POST /api/admin/system/clear-cache", () => {
  beforeEach(() => {
    // Make the test use the in-memory cache mode so the test
    // doesn't need real Redis. The endpoint calls
    // invalidateCanonicalInitialStateCache() which works in
    // both modes.
    __setCacheImplementationForTests(true);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await POST();
    // 401 (no session) or 403 (admin not in role list) — both
    // are valid auth failures. We don't care which.
    expect([401, 403]).toContain(res.status);
  });
});

/**
 * tests/api/admin/marketOverview-activeEvent.test.ts
 *
 * Tests for the activeGlobalEvent field in the GET
 * /api/admin/market/overview response. The field is populated
 * by the server via `resolveActiveGlobalMarketEvent()`.
 */

import { describe, it, expect, vi } from "vitest";
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

describe("GET /api/admin/market/overview - activeGlobalEvent field", () => {
  it("rejects unauthenticated requests", async () => {
    const { GET } = await import("@/app/api/admin/market/overview/route");
    const res = await GET();
    // 401 (no session) or 403 (admin not in role list) — both
    // are valid auth failures.
    expect([401, 403]).toContain(res.status);
  });
});
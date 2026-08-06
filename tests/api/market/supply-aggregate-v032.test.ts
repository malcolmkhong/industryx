/**
 * tests/api/market/supply-aggregate-v032.test.ts
 *
 * NEW-TEST-031 (V-032 / PR-BP-2, 2026-07-15):
 *
 * Integration coverage for POST /api/market/supply/aggregate after the
 * V-032 fix. The cron MUST read per-player supply from the dedicated
 * `server_game_state.market_supply` JSONB column (populated by
 * `buildMarketSupplyProjection`) — NOT from `full_state.productionSnapshot`,
 * which `stripUIFields` removes before persistence.
 *
 * Required regression (per audit §9.7.1 V-032):
 *   "Aggregate cron produces nonzero numbers for at least one active
 *    factory building."
 *
 * Strategy:
 *   - Mock `pageServerGameStateFullState` to return rows with populated
 *     `market_supply` projections covering ≥ 1 player and ≥ 1 resource.
 *   - Mock the `upsert_supply_demand` RPC to capture calls.
 *   - Assert the response aggregates non-zero production / consumption
 *     and that the RPC was called with the summed totals.
 *   - One negative case: rows where `market_supply` is empty/stubbed
 *     produce ZERO aggregation. This is the contract that guarantees
 *     the previous silent-zero bug cannot reappear.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock('@/lib/db/access', () => ({
  createServiceRoleClient: vi.fn(),
  // BUG-077: canonical boundary names mirror the legacy alias.
  getDbClient: vi.fn(),
  requireDbClient: () => ({ from: vi.fn() }),
  isDbClientConfigured: vi.fn(() => true),
  createClient: vi.fn(),
  isServiceRoleConfigured: () => true,
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  pageServerGameStateFullState: vi.fn(),
}));

import { POST } from "@/app/api/market/supply/aggregate/route";
import { pageServerGameStateFullState } from "@/lib/db/game/serverGameState";

type FakeRow = {
  full_state: unknown;
  market_supply: unknown;
};

function makeMockClient(rows: FakeRow[]) {
  return {
    rpc: vi.fn(async (name: string, _args: Record<string, unknown>) => {
      // The cron calls upsert_supply_demand(resource, prod, cons, n).
      // Capture the call name; we don't need to return anything.
      return { data: null, error: null, name };
    }),
  };
}

async function runCronWith(
  pages: Array<{ rows: FakeRow[]; hasMore: boolean }>,
) {
  // pageServerGameStateFullState returns one page per call; we paginate
  // by stacking pages until `hasMore === false`.
  let callIndex = 0;
  (pageServerGameStateFullState as ReturnType<typeof vi.fn>).mockImplementation(
    async () => {
      const page = pages[callIndex++] ?? { rows: [], hasMore: false };
      return page;
    },
  );

  // Inject the mock supabase client.
  // C-004 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16): the test
  // previously imported `createServiceRoleClient` from the legacy
  // `@/lib/supabase/server` shim, but the production route resolves it
  // from `@/lib/db/access` (DB-015 boundary). Mock the actual import
  // path the route uses.
  const { createServiceRoleClient } = await import("@/lib/db/access");
  const mockClient = makeMockClient([]);
  (createServiceRoleClient as ReturnType<typeof vi.fn>).mockReturnValue(
    mockClient,
  );

  return { res: await POST(), mockClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/market/supply/aggregate — V-032 / PR-BP-2", () => {
  it("aggregates non-zero production from rows with populated market_supply", async () => {
    const page: { rows: FakeRow[]; hasMore: boolean } = {
      rows: [
        {
          full_state: { gameTick: 50 }, // legacy field: NOT read by cron any more
          market_supply: {
            production: { iron: 12.3, copper: 5.1 },
            actualConsumption: { iron: 8 },
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
        },
        {
          full_state: {},
          market_supply: {
            production: { iron: 4.7 },
            actualConsumption: { iron: 1.5, copper: 0.2 },
            updatedAt: "2026-07-15T00:00:01.000Z",
          },
        },
      ],
      hasMore: false,
    };

    const { res, mockClient } = await runCronWith([page]);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.playersScanned).toBe(2);
    // iron: 12.3 + 4.7 = 17, copper: 5.1
    expect(body.resourcesAggregated).toBeGreaterThan(0);

    // The aggregate cron must call upsert_supply_demand for each resource
    // with the summed production, consumption, and player count.
    const rpc = mockClient.rpc as ReturnType<typeof vi.fn>;
    const calls = rpc.mock.calls.map((c) => c[1]);

    // iron: production=17, consumption=8+1.5=9.5, player_count=2
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_resource: "iron",
          p_production: 17,
          p_consumption: 9.5,
          p_player_count: 2,
        }),
      ]),
    );
    // copper: production=5.1, consumption=0.2, player_count=1
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_resource: "copper",
          p_production: 5.1,
          p_consumption: 0.2,
          p_player_count: 1,
        }),
      ]),
    );
  });

  it("skips rows where market_supply is the empty stub", async () => {
    const page: { rows: FakeRow[]; hasMore: boolean } = {
      rows: [
        {
          full_state: {},
          market_supply: { production: {}, actualConsumption: {}, updatedAt: "x" },
        },
        {
          full_state: {},
          market_supply: null,
        },
      ],
      hasMore: false,
    };

    const { res, mockClient } = await runCronWith([page]);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.playersScanned).toBe(2);
    // No resources aggregated — totals are all zero, the upserts are
    // never invoked because the per-resource set is empty.
    expect(body.resourcesAggregated).toBe(0);
    expect((mockClient.rpc as ReturnType<typeof vi.fn>).mock.calls).toEqual([]);
  });

  it("does NOT read full_state.productionSnapshot (Phase 13 invariant)", async () => {
    // Regression guard: the previous implementation read
    // `row.full_state.productionSnapshot`, which `stripUIFields` strips,
    // so the read always returned undefined and the loop skipped every
    // player. After PR-BP-2, even if a row LEAKS a stale
    // productionSnapshot inside full_state, the cron MUST ignore it.
    const page: { rows: FakeRow[]; hasMore: boolean } = {
      rows: [
        {
          full_state: {
            // Stale / leaked UI-shaped snapshot — must be ignored.
            productionSnapshot: {
              production: { iron: 999 },
              actualConsumption: { iron: 999 },
            },
          },
          market_supply: { production: {}, actualConsumption: {}, updatedAt: "x" },
        },
      ],
      hasMore: false,
    };

    const { res, mockClient } = await runCronWith([page]);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resourcesAggregated).toBe(0);
    // The leaked stale 999 must NOT drive an RPC call.
    expect((mockClient.rpc as ReturnType<typeof vi.fn>).mock.calls).toEqual([]);
  });

  it("paginates through multiple pages", async () => {
    const page1: { rows: FakeRow[]; hasMore: boolean } = {
      rows: [
        {
          full_state: {},
          market_supply: {
            production: { iron: 5 },
            actualConsumption: {},
            updatedAt: "t1",
          },
        },
      ],
      hasMore: true,
    };
    const page2: { rows: FakeRow[]; hasMore: boolean } = {
      rows: [
        {
          full_state: {},
          market_supply: {
            production: { iron: 3 },
            actualConsumption: {},
            updatedAt: "t2",
          },
        },
        {
          full_state: {},
          market_supply: {
            production: { copper: 2 },
            actualConsumption: {},
            updatedAt: "t2",
          },
        },
      ],
      hasMore: false,
    };

    const { res } = await runCronWith([page1, page2]);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.playersScanned).toBe(3);
    expect(body.resourcesAggregated).toBe(2);
  });
});

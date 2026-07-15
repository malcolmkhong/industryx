/**
 * tests/unit/runServerTicks.storageOverflow.test.ts
 *
 * TST-016 / TST-017 / NEW-TEST-049 (PR-BP-3 §2.1, 2026-07-15):
 *   - V-003: storage overflow is no longer silently discarded. The tick
 *     records a structured `{ produced, accepted, wasted }` per resource
 *     on the returned `productionSnapshot.storageOverflow`.
 *   - V-004: missing `resourceCapacity` row fails closed (RangeError) —
 *     was `?? Infinity` unbounded fallback.
 *   - V-004: `hasUnlimitedStorage(state.megaProjects)` is honored
 *     server-side — same rule as the client `getCapacity()` helper.
 *
 * Mock strategy: stub the downstream server-side calculators so we can
 * drive `runServerTicks` with a known per-tick output without needing
 * real building/worker definitions or a populated `GameConfig`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks (vi.mock factory runs before imports) ──────────────────
const { computeProductionServer } = vi.hoisted(() => ({
  computeProductionServer: vi.fn(() => ({
    canProduce: true,
    inputs: [],
    actualInputs: [],
    outputs: [{ resource: "iron", amount: 250 }],
    efficiency: 1,
  })),
}));

vi.mock(
  "@/lib/game/production/engine/math/multipliers.server",
  () => ({
    buildMultipliersServer: vi.fn(() => ({
      powerEfficiency: 1,
    })),
    buildWorkerDefsMap: vi.fn(() => ({})),
    getBuildingDef: vi.fn(() => ({ category: "extractor" })),
  }),
);

vi.mock("@/lib/game/production/engine/math/power.server", () => ({
  computePowerGridServer: vi.fn(() => ({
    totalProduction: 0,
    totalConsumption: 0,
    efficiency: 1,
    overload: false,
    fuelConsumption: [],
  })),
}));

vi.mock("@/lib/game/production/engine/math/production.server", () => ({
  computeProductionServer,
}));

vi.mock("@/lib/game/production/engine/math/endgame.server", () => ({
  computeEndgameIncomeServer: vi.fn(() => ({
    moneyPerTick: 0,
    researchPerTick: 0,
    corpPerTick: 0,
  })),
}));

vi.mock("@/lib/game/production/engine/tick/weatherTick", () => ({
  advanceWeatherTick: vi.fn(),
}));

// Stub the production snapshot builder so we don't drag the rest of the
// math layer in — we only care that storageOverflow reaches the snapshot.
vi.mock("@/lib/game/production/engine/tick/productionSnapshot", () => ({
  buildProductionSnapshotServer: vi.fn(() => ({
    production: {},
    consumption: {},
    actualConsumption: {},
    buildings: {},
    powerProduction: 0,
    powerConsumption: 0,
    powerEfficiency: 1,
    powerOverload: false,
    payoutPerCycle: 0,
    payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
    sellMultiplier: 0,
    endgameMoney: 0,
    endgameResearch: 0,
    endgameCorp: 0,
    moneyIncomeRate: 0,
    moneyExpenseRate: 0,
    rpIncomeRate: 0,
    rpExpenseRate: 0,
    cpIncomeRate: 0,
    cpExpenseRate: 0,
    storageOverflow: {},
  })),
}));

// ── imports ─────────────────────────────────────────────────────────────
import { runServerTicks } from "@/lib/game/production/engine/tick/runServerTicks";
import type { GameConfig } from "@/lib/game/config/types/gameConfig";
import type { ServerGameData } from "@/lib/game/shared/types/types";

const STUB_CONFIG = {
  buildings: {},
  workers: [],
} as unknown as GameConfig;

function makeBaseState(
  overrides: Partial<{
    resourceCapacity: Record<string, number>;
    resources: Record<string, number>;
    megaProjects: Array<{
      completed: boolean;
      bonus: { type: string; value: number };
    }>;
  }> = {},
): ServerGameData {
  return {
    gameTick: 0,
    money: 0,
    totalMoneyEarned: 0,
    researchPoints: 0,
    prestigeState: {
      totalPrestiges: 0,
      corporationPoints: 0,
    },
    weather: {
      intensity: 0,
      duration: 0,
      currentType: "neutral",
    },
    buildings: [
      {
        id: "b1",
        type: "ironExtractor",
        level: 1,
        active: true,
        placedAt: 0,
        workers: [],
        efficiency: 1,
        isBuilding: false,
      },
    ],
    resources: (overrides.resources ?? { iron: 0 }) as Record<
      string,
      number
    >,
    resourceCapacity: (overrides.resourceCapacity ?? { iron: 100 }) as Record<
      string,
      number
    >,
    megaProjects: (overrides.megaProjects ?? []) as ServerGameData["megaProjects"],
    powerGrid: {
      totalProduction: 0,
      totalConsumption: 0,
      efficiency: 1,
      overload: false,
      plants: [],
    },
  } as unknown as ServerGameData;
}

describe("runServerTicks — storage overflow (V-003 / PR-BP-3 §2.1)", () => {
  beforeEach(() => {
    // Default: building outputs 250 iron/tick, capacity = 100. Should
    // overflow by 150 each tick.
    computeProductionServer.mockReturnValue({
      canProduce: true,
      inputs: [],
      actualInputs: [],
      outputs: [{ resource: "iron", amount: 250 }],
      efficiency: 1,
    });
  });

  it("TST-016: clamps the output to capacity and tracks wasted on storageOverflow", () => {
    const { productionSnapshot } = runServerTicks(
      makeBaseState({ resourceCapacity: { iron: 100 }, resources: { iron: 0 } }),
      3,
      STUB_CONFIG,
    );

    const overflow = productionSnapshot.storageOverflow ?? {};
    expect(overflow.iron).toBeDefined();
    // 250 produced per tick × 3 ticks, capped at 100 total in storage.
    expect(overflow.iron.produced).toBe(750);
    expect(overflow.iron.accepted).toBe(100);
    expect(overflow.iron.wasted).toBe(650);
  });

  it("TST-017: empty overflow report when output fits in capacity", () => {
    computeProductionServer.mockReturnValueOnce({
      canProduce: true,
      inputs: [],
      actualInputs: [],
      outputs: [{ resource: "iron", amount: 50 }],
      efficiency: 1,
    });
    const { productionSnapshot } = runServerTicks(
      makeBaseState({ resourceCapacity: { iron: 100 }, resources: { iron: 0 } }),
      1,
      STUB_CONFIG,
    );

    expect(productionSnapshot.storageOverflow).toEqual({});
  });

  it("NEW-TEST-049 (V-004): fails closed when resourceCapacity row is missing", () => {
    expect(() =>
      runServerTicks(
        // Iron has no capacity row; ironExtractor outputs iron.
        makeBaseState({ resourceCapacity: { iron: undefined as unknown as number } }),
        1,
        STUB_CONFIG,
      ),
    ).toThrow(/missing or non-finite resourceCapacity for "iron"/);
  });

  it("NEW-TEST-049 (V-004): completed Terraforming Engine mega project → unlimited", () => {
    const { productionSnapshot, newState } = runServerTicks(
      makeBaseState({
        resourceCapacity: { iron: 100 },
        resources: { iron: 0 },
        megaProjects: [
          {
            completed: true,
            bonus: { type: "unlimitedStorage", value: 0 },
          },
        ],
      }),
      5, // 250/tick × 5 = 1250 — would overflow a 100 cap otherwise
      STUB_CONFIG,
    );

    expect(productionSnapshot.storageOverflow).toEqual({});
    // With unlimited storage, all 1250 produced is accepted.
    expect((newState.resources as Record<string, number>).iron).toBe(1250);
  });

  it("empty overflow stays empty when building cannot produce", () => {
    computeProductionServer.mockReturnValueOnce({
      canProduce: false,
      inputs: [],
      actualInputs: [],
      outputs: [],
      efficiency: 0,
    });
    const { productionSnapshot } = runServerTicks(
      makeBaseState({ resourceCapacity: { iron: 100 }, resources: { iron: 0 } }),
      1,
      STUB_CONFIG,
    );

    expect(productionSnapshot.storageOverflow).toEqual({});
  });
});

/**
 * tests/unit/production/pr-bp-3-expense-rates.test.ts
 *
 * V-035 / PR-BP-3 §2.3 (2026-07-15):
 *   The snapshot carried `moneyIncomeRate / moneyExpenseRate /
 *   rpIncomeRate / rpExpenseRate / cpIncomeRate / cpExpenseRate` keys but
 *   expense rates were ALWAYS stub-0. This pins the wiring: expense
 *   rates are derived from `actualConsumption` so a future building
 *   recipe that consumes money/RP/CP as an input automatically populates
 *   its expense field.
 *
 * Maps to: Audit §5.6 (silent failure states), §9.5 V-035.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import fixture from "../../fixtures/balanceFixture.json";
import {
  applyBalanceOverrides,
  _resetBalanceForTests,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";

const BALANCE = fixture as unknown as GameBalanceConfig;

// ── hoisted mocks: keep `buildProductionSnapshotServer` deterministic ──
const { computeProductionServer, computePowerGridServer } = vi.hoisted(() => ({
  computeProductionServer: vi.fn(() => ({
    canProduce: true,
    inputs: [{ resource: "iron", amount: 10 }],
    actualInputs: [{ resource: "iron", amount: 10 }],
    outputs: [{ resource: "ironPlate", amount: 5 }],
    efficiency: 1,
  })),
  computePowerGridServer: vi.fn(() => ({
    totalProduction: 0,
    totalConsumption: 0,
    efficiency: 1,
    overload: false,
    fuelConsumption: [],
  })),
}));

vi.mock("@/lib/game/production/engine/math/multipliers.server", () => ({
  buildMultipliersServer: vi.fn(() => ({
    powerEfficiency: 1,
    eventProductionGlobal: 1,
    weatherProduction: 1,
    transportProductionBonus: 1,
    transportThroughputBonus: 0,
    marketBonus: 0,
    extractorBonus: 0,
    factoryBonus: 0,
    t1FactoryBonus: 0,
    t2FactoryBonus: 0,
    t3FactoryBonus: 0,
    workerEfficiencyTotal: 0,
    specificBuildingBonuses: new Map(),
    workersByBuilding: new Map(),
    eventProductionTargeted: new Map(),
    weatherSolar: 1,
    weatherWind: 1,
    hasEnergyEfficiency: false,
    hasPowerOptimization: false,
    eventPowerConsumption: 1,
    powerBonus: 0,
    productionBonus: 0,
    gameDefs: { buildings: {}, workers: {}, recipes: {} } as never,
  })),
  buildWorkerDefsMap: vi.fn(() => ({})),
  getBuildingDef: vi.fn(() => ({ category: "factory" })),
}));

vi.mock("@/lib/game/production/engine/math/power.server", () => ({
  computePowerGridServer,
}));

vi.mock("@/lib/game/production/engine/math/production.server", () => ({
  computeProductionServer,
}));

vi.mock("@/lib/game/production/engine/math/payout.server", () => ({
  computePayoutServer: vi.fn(() => ({
    amountPerCycle: 0,
    breakdown: { extractors: 0, factories: 0, power: 0 },
  })),
}));

vi.mock("@/lib/game/production/engine/math/sell.server", () => ({
  computeSellMultiplierServer: vi.fn(() => 1),
}));

vi.mock("@/lib/game/production/engine/math/endgame.server", () => ({
  computeEndgameIncomeServer: vi.fn(() => ({
    moneyPerTick: 100,
    researchPerTick: 5,
    corpPerTick: 1,
  })),
}));

// ── imports ──
import { buildProductionSnapshotServer } from "@/lib/game/production/engine/tick/productionSnapshot";
import type { GameConfig } from "@/lib/game/config/types/gameConfig";
import type { ServerGameData } from "@/lib/game/shared/types/types";

const STUB_CONFIG = {
  buildings: {},
  workers: [],
} as unknown as GameConfig;

beforeEach(() => {
  _resetBalanceForTests();
  applyBalanceOverrides(BALANCE);
  computeProductionServer.mockReturnValue({
    canProduce: true,
    inputs: [{ resource: "iron", amount: 10 }],
    actualInputs: [{ resource: "iron", amount: 10 }],
    outputs: [{ resource: "ironPlate", amount: 5 }],
    efficiency: 1,
  });
});

function makeState(
  overrides: Partial<{
    resources: Record<string, number>;
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
    weather: { intensity: 0, duration: 0, currentType: "neutral" },
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
    resources: overrides.resources ?? { iron: 100 } as Record<string, number>,
    resourceCapacity: {} as Record<string, number>,
    megaProjects: [],
    powerGrid: {
      totalProduction: 0,
      totalConsumption: 0,
      efficiency: 1,
      overload: false,
      plants: [],
    },
  } as unknown as ServerGameData;
}

describe("V-035 / PR-BP-3 §2.3 — currency expense-rate wiring", () => {
  it("income rates reflect endgame per-tick (money/RP/CP)", () => {
    const snapshot = buildProductionSnapshotServer(makeState(), STUB_CONFIG);

    expect(snapshot.moneyIncomeRate).toBe(100);
    expect(snapshot.rpIncomeRate).toBe(5);
    expect(snapshot.cpIncomeRate).toBe(1);
  });

  it("expense rates default to 0 when no currency inputs", () => {
    const snapshot = buildProductionSnapshotServer(makeState(), STUB_CONFIG);

    expect(snapshot.moneyExpenseRate).toBe(0);
    expect(snapshot.rpExpenseRate).toBe(0);
    expect(snapshot.cpExpenseRate).toBe(0);
  });

  it("moneyExpenseRate surfaces when a building consumes money", () => {
    // Building recipe that consumes money as an input (currently no
    // production def does this, but the wiring must handle it so a
    // future building automatically populates its expense rate).
    computeProductionServer.mockReturnValueOnce({
      canProduce: true,
      inputs: [{ resource: "money", amount: 42 }],
      actualInputs: [{ resource: "money", amount: 42 }],
      outputs: [{ resource: "ironPlate", amount: 1 }],
      efficiency: 1,
    });
    const snapshot = buildProductionSnapshotServer(makeState(), STUB_CONFIG);

    expect(snapshot.moneyExpenseRate).toBe(42);
    expect(snapshot.rpExpenseRate).toBe(0);
    expect(snapshot.cpExpenseRate).toBe(0);
  });

  it("rpExpenseRate surfaces when a building consumes researchPoints", () => {
    computeProductionServer.mockReturnValueOnce({
      canProduce: true,
      inputs: [{ resource: "researchPoints", amount: 17 }],
      actualInputs: [{ resource: "researchPoints", amount: 17 }],
      outputs: [{ resource: "ironPlate", amount: 1 }],
      efficiency: 1,
    });
    const snapshot = buildProductionSnapshotServer(makeState(), STUB_CONFIG);

    expect(snapshot.rpExpenseRate).toBe(17);
    expect(snapshot.moneyExpenseRate).toBe(0);
    expect(snapshot.cpExpenseRate).toBe(0);
  });

  it("cpExpenseRate surfaces when a building consumes corporationPoints", () => {
    computeProductionServer.mockReturnValueOnce({
      canProduce: true,
      inputs: [{ resource: "corporationPoints", amount: 3 }],
      actualInputs: [{ resource: "corporationPoints", amount: 3 }],
      outputs: [{ resource: "ironPlate", amount: 1 }],
      efficiency: 1,
    });
    const snapshot = buildProductionSnapshotServer(makeState(), STUB_CONFIG);

    expect(snapshot.cpExpenseRate).toBe(3);
    expect(snapshot.moneyExpenseRate).toBe(0);
    expect(snapshot.rpExpenseRate).toBe(0);
  });

  it("empty stub snapshot has zero expense rates (store pre-hydrate)", async () => {
    // Confirm `emptyProductionSnapshot()` returns a valid stub with the
    // six currency-rate fields at 0 — required by the Phase 13 / V-001
    // store pre-hydrate contract.
    const { emptyProductionSnapshot } = await import(
      "@/lib/game/production/snapshot/emptyProductionSnapshot"
    );
    const stub = emptyProductionSnapshot();
    expect(stub.moneyIncomeRate).toBe(0);
    expect(stub.moneyExpenseRate).toBe(0);
    expect(stub.rpIncomeRate).toBe(0);
    expect(stub.rpExpenseRate).toBe(0);
    expect(stub.cpIncomeRate).toBe(0);
    expect(stub.cpExpenseRate).toBe(0);
    // Sanity: also keep §2.1 storageOverflow stub untouched.
    expect(stub.storageOverflow).toEqual({});
  });
});

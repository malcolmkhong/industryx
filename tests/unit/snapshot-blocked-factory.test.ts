/**
 * tests/unit/snapshot-blocked-factory.test.ts
 *
 * C-001 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
 *   `buildProductionSnapshotServer` previously aggregated `result.outputs`
 *   from EVERY building regardless of `canProduce`. A factory that ran
 *   out of inputs returned `canProduce: false` with a populated
 *   `outputs` array (potential output), and the snapshot reported that
 *   potential output as actual production. `runServerTicks` correctly
 *   skipped the result, so inventory and money stayed correct, but the
 *   UI snapshot over-reported production rates for blocked factories.
 *
 * Required regression (per audit §10.6 P0):
 *   - Blocked factory (`canProduce: false`) yields zero in
 *     `productionSnapshot.production[resource]` and an empty
 *     `productionSnapshot.buildings[id].outputs`.
 *   - Active factory (`canProduce: true`) still populates both.
 *   - Demand (`productionSnapshot.consumption`) keeps tracking input
 *     demand from blocked factories, so the planner can still see the
 *     deficit.
 *   - `actualConsumption` (what was really debited) reflects the
 *     `actualInputs` array, which is empty for blocked factories.
 *
 * Mock strategy: stub downstream server-side calculators so the real
 * `buildProductionSnapshotServer` and `runServerTicks` run with
 * controlled per-building output. Same pattern as
 * `runServerTicks.storageOverflow.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks (vi.mock factory runs before imports) ──────────────
// P2-10: production code imports directly from productionCalculator.
// Mock the entire barrel so the real computeProduction (which calls
// getBalance) never runs. The test provides default return values via
// the hoisted mock factory.
const { computeProduction } = vi.hoisted(() => ({
  computeProduction: vi.fn(),
}));

// Default healthy-factory return value.
const HEALTHY_RESULT = {
  canProduce: true,
  inputs: [],
  actualInputs: [],
  outputs: [{ resource: "iron", amount: 250 }],
  efficiency: 1,
  workerPowerSavings: 0,
  reason: null,
} as const;

vi.mock("@/lib/game/production/engine/math/multipliers.server", () => ({
  buildMultipliersServer: vi.fn(() => ({ powerEfficiency: 1 })),
  buildWorkerDefsMap: vi.fn(() => ({})),
  getBuildingDef: vi.fn(() => ({ category: "factory" })),
}));

vi.mock("@/lib/game/production/productionCalculator", () => ({
  getBuildingDef: vi.fn(),
  getWorkerDef: vi.fn(),
  buildMultipliers: vi.fn(() => ({
    powerEfficiency: 1,
    productionBonus: 0,
    eventProductionGlobal: 1,
    weatherProduction: 1,
    transportProductionBonus: 1,
    marketBonus: 0,
    extractorBonus: 0,
    factoryBonus: 0,
    t1FactoryBonus: 0,
    t2FactoryBonus: 0,
    t3FactoryBonus: 0,
    workerEfficiencyTotal: 0,
    specificBuildingBonuses: new Map<string, number>(),
    workersByBuilding: new Map<string, never[]>(),
    eventProductionTargeted: new Map<string, number>(),
    weatherSolar: 1,
    weatherWind: 1,
    hasEnergyEfficiency: false,
    hasPowerOptimization: false,
    eventPowerConsumption: 1,
    powerBonus: 0,
  })),
  computePowerGrid: vi.fn(() => ({
    totalProduction: 0,
    totalConsumption: 0,
    efficiency: 1,
    overload: false,
    fuelConsumption: [],
  })),
  computeProduction,
  computeSellMultiplier: vi.fn(() => 1),
  computePayout: vi.fn(() => ({
    amountPerCycle: 0,
    breakdown: { extractors: 0, factories: 0, power: 0 },
  })),
  computeEndgameIncome: vi.fn(() => ({
    moneyPerTick: 0,
    researchPerTick: 0,
    corpPerTick: 0,
  })),
  emptyProductionSnapshot: vi.fn(() => ({
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

vi.mock("@/lib/game/production/engine/math/payout.server", () => ({
  computePayoutServer: vi.fn(() => ({
    amountPerCycle: 0,
    breakdown: { extractors: 0, factories: 0, power: 0 },
  })),
}));

vi.mock("@/lib/game/production/engine/math/sell.server", () => ({
  computeSellMultiplierServer: vi.fn(() => 1),
}));

vi.mock("@/lib/game/production/engine/tick/weatherTick", () => ({
  advanceWeatherTick: vi.fn(),
}));

// ── imports ───────────────────────────────────────────────────────────
import { runServerTicks } from "@/lib/game/production/engine/tick/runServerTicks";
import type { GameConfig } from "@/lib/game/config/types/gameConfig";
import type { ServerGameData } from "@/lib/game/shared/types/types";

const STUB_CONFIG = {
  buildings: {},
  workers: [],
} as unknown as GameConfig;

function makeBaseState(): ServerGameData {
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
        id: "smelter-1",
        type: "ironSmelter",
        level: 1,
        active: true,
        placedAt: 0,
        workers: [],
        efficiency: 1,
        isBuilding: false,
      },
    ],
    resources: { iron: 0, ironPlate: 0 } as Record<string, number>,
    resourceCapacity: { iron: 100, ironPlate: 100 } as Record<string, number>,
    megaProjects: [] as ServerGameData["megaProjects"],
    powerGrid: {
      totalProduction: 0,
      totalConsumption: 0,
      efficiency: 1,
      overload: false,
      plants: [],
    },
  } as unknown as ServerGameData;
}

describe("C-001 — buildProductionSnapshotServer excludes blocked factories", () => {
  beforeEach(() => {
    computeProduction.mockReset();
    computeProduction.mockReturnValue({ ...HEALTHY_RESULT });
    // Default: blocked factory (missing inputs). The calculator still
    // returns the potential output so a naive aggregator can over-report.
    computeProduction.mockReturnValue({
      canProduce: false,
      inputs: [{ resource: "iron", amount: 2 }],
      actualInputs: [],
      // Critical: outputs is populated even though canProduce=false.
      // This is the exact calculator shape the snapshot must filter out.
      outputs: [{ resource: "ironPlate", amount: 5 }],
      efficiency: 0.5,
      workerPowerSavings: 0,
      reason: "missing_inputs",
    });
  });

  it("C-001: blocked factory contributes ZERO to snapshot.production", () => {
    const { productionSnapshot } = runServerTicks(makeBaseState(), 1, STUB_CONFIG);

    expect(productionSnapshot.production.ironPlate ?? 0).toBe(0);
  });

  it("C-001: blocked factory has EMPTY outputs in snapshot.buildings[id]", () => {
    const { productionSnapshot } = runServerTicks(makeBaseState(), 1, STUB_CONFIG);

    const buildingSnap =
      productionSnapshot.buildings["smelter-1"] ?? { outputs: [] };
    expect(buildingSnap.outputs).toEqual([]);
  });

  it("C-001: blocked factory still records input demand for the planner", () => {
    const { productionSnapshot } = runServerTicks(makeBaseState(), 1, STUB_CONFIG);

    // Demand is a planning signal; even blocked factories advertise it.
    expect(productionSnapshot.consumption.iron ?? 0).toBe(2);
  });

  it("C-001: blocked factory has ZERO actualConsumption (nothing was debited)", () => {
    const { productionSnapshot } = runServerTicks(makeBaseState(), 1, STUB_CONFIG);

    expect(productionSnapshot.actualConsumption.iron ?? 0).toBe(0);
  });

  it("C-001: active factory still populates production normally", () => {
    // Switch the mock to a producing factory; nothing about the contract
    // for healthy buildings should change.
    computeProduction.mockReturnValue({
      canProduce: true,
      inputs: [{ resource: "iron", amount: 2 }],
      actualInputs: [{ resource: "iron", amount: 2 }],
      outputs: [{ resource: "ironPlate", amount: 5 }],
      efficiency: 1,
      reason: null,
    });

    const { productionSnapshot } = runServerTicks(makeBaseState(), 1, STUB_CONFIG);

    expect(productionSnapshot.production.ironPlate ?? 0).toBe(5);
    expect(
      productionSnapshot.buildings["smelter-1"]?.outputs ?? [],
    ).toEqual([{ resource: "ironPlate", amount: 5 }]);
    expect(productionSnapshot.actualConsumption.iron ?? 0).toBe(2);
  });
});

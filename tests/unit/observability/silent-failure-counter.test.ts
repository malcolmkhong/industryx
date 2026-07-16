/**
 * tests/unit/observability/silent-failure-counter.test.ts
 *
 * NEW-TEST-045 (audit §5.6 / PR-BP-5 §7 / 2026-07-15):
 *   production.silent_failure_count{reason} increments per §5.6 case.
 * NEW-TEST-031 telemetry variant:
 *   snapshot installation rate (tick response vs emitted snapshot).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/game/production/engine/math/multipliers.server", () => ({
  buildMultipliersServer: vi.fn(() => ({
    powerEfficiency: 1,
    productionBonus: 0,
    eventProductionGlobal: 1,
    weatherProduction: 1,
    transportProductionBonus: 1,
    extractorBonus: 0,
    factoryBonus: 0,
    t1FactoryBonus: 0,
    t2FactoryBonus: 0,
    t3FactoryBonus: 0,
    workerEfficiencyTotal: 0,
    eventProductionTargeted: new Map<string, number>(),
    eventPowerConsumption: 1,
    weatherSolar: 1,
    weatherWind: 1,
    hasEnergyEfficiency: false,
    hasPowerOptimization: false,
    powerBonus: 0,
    specificBuildingBonuses: new Map<string, number>(),
    workersByBuilding: new Map<string, never[]>(),
    gameDefs: { buildings: {}, workers: {} },
  })),
  buildWorkerDefsMap: vi.fn(() => ({})),
  getBuildingDef: vi.fn(() => undefined),
}));

// P2-10: production code uses direct imports from productionCalculator.
// Mock the entire barrel directly so the real `computeProduction`
// (which calls getBalance and would throw BalanceNotLoadedError) is
// never loaded. The test calls `computeProduction()` directly below,
// which routes to the mocked version.
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
    specificBuildingBonuses: new Map(),
    workersByBuilding: new Map(),
    eventProductionTargeted: new Map(),
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
  computeProduction: vi.fn(() => ({
    canProduce: true,
    inputs: [],
    actualInputs: [],
    outputs: [{ resource: "iron", amount: 250 }],
    efficiency: 1,
    workerPowerSavings: 0,
    reason: null,
  })),
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

import {
  _resetTelemetryCounters,
  getSilentFailureCounts,
  recordSilentFailure,
  recordTickResponse,
  getSnapshotInstallationMetrics,
} from "@/lib/game/production/observability";
import { computeProduction } from "@/lib/game/production/math/production";
import { computePowerGrid } from "@/lib/game/production/math/power";
import { runServerTicks } from "@/lib/game/production/engine/tick/runServerTicks";
import balanceFixture from "../../fixtures/balanceFixture.json";
import {
  applyBalanceOverrides,
  _resetBalanceForTests,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";import type { MultiplierCache } from "@/lib/game/production/math/multipliers";
import type { BuildingInstance, ServerGameData } from "@/lib/game/shared/types/types";
import type { GameConfig } from "@/lib/game/config/config";

const BALANCE = balanceFixture as unknown as GameBalanceConfig;

function emptyCache(defs: MultiplierCache["gameDefs"]): MultiplierCache {
  return {
    productionBonus: 0, eventProductionGlobal: 1, weatherProduction: 1,
    powerEfficiency: 1, transportProductionBonus: 1, marketBonus: 0,
    extractorBonus: 0, factoryBonus: 0, t1FactoryBonus: 0,
    t2FactoryBonus: 0, t3FactoryBonus: 0, workerEfficiencyTotal: 0,
    specificBuildingBonuses: new Map<string, number>(),
    workersByBuilding: new Map<string, never[]>(),
    eventProductionTargeted: new Map<string, number>(),
    weatherSolar: 1, weatherWind: 1, hasEnergyEfficiency: false,
    hasPowerOptimization: false, eventPowerConsumption: 1,
    powerBonus: 0, gameDefs: defs,
  } as unknown as MultiplierCache;
}

function makeBuilding(overrides: Partial<BuildingInstance>): BuildingInstance {
  return { id: "b1", type: "ironExtractor" as never, level: 1,
    efficiency: 1, active: true, placedAt: 0, workers: [],
    isBuilding: false, ...overrides } as unknown as BuildingInstance;
}

beforeEach(() => {
  _resetBalanceForTests();
  applyBalanceOverrides(BALANCE);
  _resetTelemetryCounters();
});

describe("NEW-TEST-045 - 5.6 silent_failure_count", () => {
  it("1) unknown_definition increments when def is missing", () => {
    const cache = emptyCache({ buildings: {}, workers: {}, recipes: {} } as never);
    computeProduction(makeBuilding({ type: "missingThing" as never }), cache, {});
    expect(getSilentFailureCounts().unknown_definition).toBe(1);
    expect(getSilentFailureCounts().inactive).toBe(0);
  });

  it("2) inactive increments when def exists and active=false", () => {
    const cache = emptyCache({ buildings: { ironExtractor: {
      type: "ironExtractor", category: "extractor",
      outputs: [{ resource: "iron", amount: 1 }], inputs: [],
      baseProductionRate: 1, basePowerConsumption: 0,
      basePowerProduction: 0, costMultiplier: 1, baseCost: [],
    } as never }, workers: {}, recipes: {} } as never);
    computeProduction(makeBuilding({ active: false }), cache, {});
    expect(getSilentFailureCounts().inactive).toBe(1);
    expect(getSilentFailureCounts().unknown_definition).toBe(0);
  });

  it("5) missing_inputs increments when factory branch runs out of inputs", () => {
    const cache = emptyCache({ buildings: { steelMill: {
      type: "steelMill", category: "factory", tier: 1,
      inputs: [{ resource: "iron", amount: 10 }],
      outputs: [{ resource: "steel", amount: 5 }],
      baseProductionRate: 1, basePowerConsumption: 0,
      basePowerProduction: 0, costMultiplier: 1, baseCost: [],
    } as never }, workers: {}, recipes: {} } as never);
    computeProduction(makeBuilding({ type: "steelMill" as never }), cache, {});
    expect(getSilentFailureCounts().missing_inputs).toBe(1);
  });

  it("6) missing_recipe increments when def has no inputs/outputs", () => {
    const cache = emptyCache({ buildings: { mystery: {
      type: "mystery", category: "unspecified",
      baseProductionRate: 1, basePowerConsumption: 0,
      basePowerProduction: 0, costMultiplier: 1, baseCost: [],
    } as never }, workers: {}, recipes: {} } as never);
    computeProduction(makeBuilding({ type: "mystery" as never }), cache, {});
    expect(getSilentFailureCounts().missing_recipe).toBe(1);
  });

  it("4) fuel_starved increments when power plant lacks fuel", () => {
    const state = { buildings: [makeBuilding({ id: "p1", type: "coalPlant" as never, active: true })],
      resources: { coal: 0 }, gameTick: 1 } as unknown as ServerGameData;
    const defs = { buildings: { coalPlant: { type: "coalPlant", category: "power",
      fuel: "coal", fuelRate: 5, basePowerProduction: 10,
      basePowerConsumption: 0, baseProductionRate: 0,
      costMultiplier: 1, baseCost: [] } as never }, workers: {}, recipes: {} } as never;
    computePowerGrid(state, emptyCache(defs), { ...state.resources }, 1, defs);
    expect(getSilentFailureCounts().fuel_starved).toBe(1);
  });

  it("3) storage_overflow increments when output exceeds capacity", () => {
    const baseState = {
      money: 0, totalMoneyEarned: 0, gameTick: 0, gameSpeed: 1,
      lastTickAt: 0, resources: { iron: 100 },
      resourceCapacity: { iron: 50 },
      buildings: [makeBuilding({ id: "x1", type: "ironExtractor" as never })],
      researchPoints: 0,
      prestigeState: { totalPrestiges: 0, corporationPoints: 0, bonuses: [] },
      totalPrestiges: 0,
      powerGrid: { totalProduction: 0, totalConsumption: 0,
        efficiency: 1, overload: false, plants: [] },
      weather: { intensity: 0, duration: 0, currentType: "neutral" },
      megaProjects: [],
    } as unknown as ServerGameData;
    const config = { buildings: {}, workers: [] } as unknown as GameConfig;
    runServerTicks(baseState, 1, config);
    expect(getSilentFailureCounts().storage_overflow).toBeGreaterThanOrEqual(1);
  });

  it("happy path produces no counter increments", () => {
    const cache = emptyCache({ buildings: { ironExtractor: {
      type: "ironExtractor", category: "extractor",
      outputs: [{ resource: "iron", amount: 1 }], inputs: [],
      baseProductionRate: 1, basePowerConsumption: 0,
      basePowerProduction: 0, costMultiplier: 1, baseCost: [],
    } as never }, workers: {}, recipes: {} } as never);
    computeProduction(makeBuilding({}), cache, { iron: 1000 });
    const counts = getSilentFailureCounts();
    expect(counts.unknown_definition).toBe(0);
    expect(counts.inactive).toBe(0);
    expect(counts.missing_inputs).toBe(0);
    expect(counts.missing_recipe).toBe(0);
  });
});

describe("NEW-TEST-031 telemetry variant - snapshot installation rate", () => {
  beforeEach(() => { _resetTelemetryCounters(); });

  it("emitted=true increments emitted counter", () => {
    recordTickResponse(true); recordTickResponse(true); recordTickResponse(false);
    const m = getSnapshotInstallationMetrics();
    expect(m.tickResponseCount).toBe(3);
    expect(m.snapshotEmittedCount).toBe(2);
    expect(m.snapshotNullCount).toBe(1);
    expect(m.installationRate).toBeCloseTo(2 / 3);
  });

  it("installation_rate is 0 when no responses recorded", () => {
    const m = getSnapshotInstallationMetrics();
    expect(m.tickResponseCount).toBe(0);
    expect(m.installationRate).toBe(0);
  });

  it("_resetTelemetryCounters zeros every counter", () => {
    recordTickResponse(true); recordTickResponse(false);
    _resetTelemetryCounters();
    const m = getSnapshotInstallationMetrics();
    expect(m.tickResponseCount).toBe(0);
    expect(m.snapshotEmittedCount).toBe(0);
    expect(m.snapshotNullCount).toBe(0);
    const counts = getSilentFailureCounts();
    expect(counts.unknown_definition).toBe(0);
    expect(counts.fuel_starved).toBe(0);
  });
});

describe("telemetry counter API contract", () => {
  it("recordSilentFailure throws on unknown reason", () => {
    expect(() =>
      (recordSilentFailure as unknown as (r: string) => void)("not_a_real_reason"),
    ).toThrow(/unknown silent_failure reason/);
  });
});

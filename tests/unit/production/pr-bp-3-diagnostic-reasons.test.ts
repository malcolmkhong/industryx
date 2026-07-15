/**
 * tests/unit/production/pr-bp-3-diagnostic-reasons.test.ts
 *
 * V-005 / PR-BP-3 §2.2 (2026-07-15):
 *   `computeProduction` previously returned identical shapes for
 *   `unknown_definition`, `inactive`, and factory `missing_inputs`. The
 *   `reason` diagnostic on `BuildResult` distinguishes them so storage /
 *   telemetry observers can tell why a building produced nothing — without
 *   changing any inactive semantics (`canProduce=false`, `efficiency=0`,
 *   empty outputs).
 *
 * Maps to:
 *   - Audit §5.1 (silent failure states), §9.5 V-005
 *   - BUG-048 (BUGS.md)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeProduction,
  type BuildResult,
} from "@/lib/game/production/math/production";
import balanceFixture from "../../fixtures/balanceFixture.json";
import {
  applyBalanceOverrides,
  _resetBalanceForTests,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";
import type { MultiplierCache } from "@/lib/game/production/math/multipliers";
import type { BuildingInstance } from "@/lib/game/shared/types/types";

const BALANCE = balanceFixture as unknown as GameBalanceConfig;

function emptyCache(defs: MultiplierCache["gameDefs"]): MultiplierCache {
  return {
    productionBonus: 0,
    eventProductionGlobal: 1,
    weatherProduction: 1,
    powerEfficiency: 1,
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
    gameDefs: defs,
  } as unknown as MultiplierCache;
}

beforeEach(() => {
  _resetBalanceForTests();
  applyBalanceOverrides(BALANCE);
});

describe("V-005 / PR-BP-3 §2.2 — BuildResult.reason distinguishes silent failures", () => {
  it("reason: 'unknown_definition' when building type has no def", () => {
    const cache = emptyCache({
      buildings: {},
      workers: {},
      recipes: {},
    } as never);
    const building: BuildingInstance = {
      id: "b1",
      type: "noSuchBuilding",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
      workers: [],
      isBuilding: false,
    } as unknown as BuildingInstance;

    const result: BuildResult = computeProduction(building, cache, {});

    expect(result.canProduce).toBe(false);
    expect(result.efficiency).toBe(0);
    expect(result.outputs).toEqual([]);
    expect(result.reason).toBe("unknown_definition");
  });

  it("reason: 'inactive' when def present and active=false", () => {
    const cache = emptyCache({
      buildings: {
        ironExtractor: {
          type: "ironExtractor",
          category: "extractor",
          outputs: [{ resource: "iron", amount: 1 }],
          inputs: [],
          baseProductionRate: 1,
          basePowerConsumption: 0,
          basePowerProduction: 0,
          costMultiplier: 1,
          baseCost: [],
        } as never,
      },
      workers: {},
      recipes: {},
    } as never);
    const building: BuildingInstance = {
      id: "b1",
      type: "ironExtractor",
      level: 1,
      efficiency: 1,
      active: false,
      placedAt: 0,
      workers: [],
      isBuilding: false,
    } as unknown as BuildingInstance;

    const result = computeProduction(building, cache, {});

    expect(result.canProduce).toBe(false);
    expect(result.efficiency).toBe(0);
    expect(result.reason).toBe("inactive");
  });

  it("reason: 'unknown_definition' takes precedence over 'inactive'", () => {
    // Both !def AND !active — deeper cause is unknown_definition.
    const cache = emptyCache({
      buildings: {},
      workers: {},
      recipes: {},
    } as never);
    const building: BuildingInstance = {
      id: "b1",
      type: "noSuchBuilding",
      level: 1,
      efficiency: 1,
      active: false, // also inactive
      placedAt: 0,
      workers: [],
      isBuilding: false,
    } as unknown as BuildingInstance;

    const result = computeProduction(building, cache, {});

    expect(result.reason).toBe("unknown_definition");
  });

  it("reason: 'missing_inputs' when factory cannot satisfy inputs", () => {
    const cache = emptyCache({
      buildings: {
        ironSmelter: {
          type: "ironSmelter",
          category: "factory",
          tier: 1,
          outputs: [{ resource: "ironPlate", amount: 1 }],
          inputs: [{ resource: "iron", amount: 1 }],
          baseProductionRate: 1,
          basePowerConsumption: 0,
          basePowerProduction: 0,
          costMultiplier: 1,
          baseCost: [],
        } as never,
      },
      workers: {},
      recipes: {},
    } as never);
    const building: BuildingInstance = {
      id: "b1",
      type: "ironSmelter",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
      workers: [],
      isBuilding: false,
    } as unknown as BuildingInstance;

    const result = computeProduction(building, cache, {
      iron: 0, // insufficient
    });

    expect(result.canProduce).toBe(false);
    expect(result.actualInputs).toEqual([]);
    expect(result.reason).toBe("missing_inputs");
  });

  it("reason: null on happy extractor path", () => {
    const cache = emptyCache({
      buildings: {
        ironExtractor: {
          type: "ironExtractor",
          category: "extractor",
          outputs: [{ resource: "iron", amount: 1 }],
          inputs: [],
          baseProductionRate: 1,
          basePowerConsumption: 0,
          basePowerProduction: 0,
          costMultiplier: 1,
          baseCost: [],
        } as never,
      },
      workers: {},
      recipes: {},
    } as never);
    const building: BuildingInstance = {
      id: "b1",
      type: "ironExtractor",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
      workers: [],
      isBuilding: false,
    } as unknown as BuildingInstance;

    const result = computeProduction(building, cache, {});

    expect(result.canProduce).toBe(true);
    expect(result.outputs.length).toBeGreaterThan(0);
    expect(result.reason).toBeNull();
  });

  it("reason: null on happy factory path (inputs satisfied)", () => {
    const cache = emptyCache({
      buildings: {
        ironSmelter: {
          type: "ironSmelter",
          category: "factory",
          tier: 1,
          outputs: [{ resource: "ironPlate", amount: 1 }],
          inputs: [{ resource: "iron", amount: 1 }],
          baseProductionRate: 1,
          basePowerConsumption: 0,
          basePowerProduction: 0,
          costMultiplier: 1,
          baseCost: [],
        } as never,
      },
      workers: {},
      recipes: {},
    } as never);
    const building: BuildingInstance = {
      id: "b1",
      type: "ironSmelter",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
      workers: [],
      isBuilding: false,
    } as unknown as BuildingInstance;

    const result = computeProduction(building, cache, {
      iron: 100,
    });

    expect(result.canProduce).toBe(true);
    expect(result.actualInputs.length).toBeGreaterThan(0);
    expect(result.reason).toBeNull();
  });

  it("reason: 'missing_recipe' for def that matches no extractor/factory branch", () => {
    // Def exists, but is neither extractor nor factory (e.g. tier-5
    // legacy row that lost its recipe, or future custom building).
    const cache = emptyCache({
      buildings: {
        mysteryBuilding: {
          type: "mysteryBuilding",
          category: "decor", // neither "extractor" nor "factory"
          outputs: [],
          inputs: [],
          baseProductionRate: 1,
          basePowerConsumption: 0,
          basePowerProduction: 0,
          costMultiplier: 1,
          baseCost: [],
        } as never,
      },
      workers: {},
      recipes: {},
    } as never);
    const building: BuildingInstance = {
      id: "b1",
      type: "mysteryBuilding",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
      workers: [],
      isBuilding: false,
    } as unknown as BuildingInstance;

    const result = computeProduction(building, cache, {});

    expect(result.canProduce).toBe(true); // preserved for compat
    expect(result.outputs).toEqual([]);
    expect(result.reason).toBe("missing_recipe");
  });
});

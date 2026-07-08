/**
 * tests/unit/mocks/productionCalculator.ts
 * Shared mock factory for the productionCalculator module.
 * Provides default implementations of all exported calculator functions.
 */

import { vi } from 'vitest';

export function createMockMultiplierCache() {
  return {
    extractorBonus: 0,
    factoryBonus: 0,
    t1FactoryBonus: 0,
    t2FactoryBonus: 0,
    t3FactoryBonus: 0,
    weatherProduction: 1,
    eventProductionGlobal: 1,
    eventResearch: 1,
    transportProductionBonus: 0,
    transportThroughputBonus: 0,
    transportMegaBonus: 0,
    researchBonus: 0,
    storageCapacityBonus: 0,
    marketBonus: 0,
    workerEfficiencyResearchBonus: 0,
    productionBonus: 0,
    powerEfficiency: 1,
    droneCapacityBonus: 0,
    droneSpeedBonus: 0,
    droneFuelBonus: 0,
    hasMarketAnalysis: false,
    specificBuildingBonuses: new Map(),
    modifierEngine: { resolve: vi.fn(() => 0.5) },
  };
}

export function createMockProductionSnapshot() {
  return {
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
    sellMultiplier: 0.5,
    endgameMoney: 0,
    endgameResearch: 0,
    endgameCorp: 0,
    moneyIncomeRate: 0,
    moneyExpenseRate: 0,
    rpIncomeRate: 0,
    rpExpenseRate: 0,
    cpIncomeRate: 0,
    cpExpenseRate: 0,
  };
}

export function createMockProductionCalculator() {
  return {
    buildMultipliers: vi.fn(() => createMockMultiplierCache()),
    computeProduction: vi.fn(() => ({
      canProduce: true,
      inputs: [],
      actualInputs: [],
      outputs: [{ resource: 'money' as string, amount: 10 }],
      efficiency: 1,
    })),
    computePowerGrid: vi.fn(() => ({
      totalProduction: 0,
      totalConsumption: 0,
      efficiency: 1,
      overload: false,
      fuelConsumption: [],
    })),
    computePayout: vi.fn(() => ({ amountPerCycle: 0, breakdown: { extractors: 0, factories: 0, power: 0 } })),
    computeEndgameIncome: vi.fn(() => ({ moneyPerTick: 0, researchPerTick: 0, corpPerTick: 0 })),
    computeSellMultiplier: vi.fn(() => 0.5),
    emptyProductionSnapshot: vi.fn(() => createMockProductionSnapshot()),
  };
}

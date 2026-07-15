/**
 * TESTS: utils/costCalculator
 *
 * Pure function tests for getBuildingCost, isResearchUnlocked, isBuildingUnlocked.
 * Maps to target: utils/costCalculator.ts
 * Imports from CURRENT store location until extraction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuildingType } from '@/lib/game/shared/types/types';

// ═════════════════════════════════════════════════════════════════════
// HOISTED MOCK DATA
// ═════════════════════════════════════════════════════════════════════

const HOIST_BUILDING_DEFS = vi.hoisted((): Record<string, Record<string, unknown>> => ({
  ironMine: {
    name: 'Iron Mine', category: 'extractor', tier: 1,
    baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1,
    outputs: [{ resource: 'iron', amount: 10 }],
  },
  copperMine: {
    name: 'Copper Mine', category: 'extractor', tier: 1,
    baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1,
    outputs: [{ resource: 'copper', amount: 10 }],
  },
  superFactory: {
    name: 'Super Factory', category: 'factory', tier: 3,
    baseCost: [{ resource: 'money', amount: 5000 }], costMultiplier: 2, baseProductionRate: 2,
    inputs: [{ resource: 'steel', amount: 10 }], outputs: [{ resource: 'robotics', amount: 5 }],
    unlockRequirement: { research: 'advancedManufacturing' },
  },
}));
const HOIST_RESEARCH_TREE = vi.hoisted((): Record<string, unknown>[] => ([
  { id: 'basicMetallurgy', name: 'Basic Metallurgy', description: '', category: 'production', tier: 1, cost: 100, timeRequired: 30, prerequisites: [], effects: [], icon: '', sortOrder: 1 },
  { id: 'advancedManufacturing', name: 'Advanced Manufacturing', description: '', category: 'factory', tier: 2, cost: 500, timeRequired: 60, prerequisites: ['basicMetallurgy'], effects: [], icon: '', sortOrder: 2 },
]));
const HOIST_WEEKLY_REWARDS = vi.hoisted((): Record<string, unknown>[] => ([]));
const HOIST_RANK_THRESHOLDS = vi.hoisted((): Record<string, unknown>[] => ([]));
const HOIST_INITIAL_MARKET = vi.hoisted((): Record<string, unknown>[] => ([]));
const HOIST_CONTRACT_TEMPLATES = vi.hoisted((): Record<string, unknown>[] => ([]));

// ─── MOCKS ──────────────────────────────────────────────────────────

vi.mock('@/lib/db/access', () => ({
  createServiceRoleClient: vi.fn(() => null),
  createClient: vi.fn(async () => null),
  isServiceRoleConfigured: vi.fn(() => false),
  isSupabaseConfigured: vi.fn(() => false),
}));

vi.mock('@/lib/game/market/news/newsLLM', () => ({
  initNewsLLM: vi.fn(async () => {}),
  registerUpdateCallback: vi.fn(),
  getLLMState: vi.fn(() => ({ initialized: false, pendingItems: [], callbacks: [] })),
  LLMEngineState: {},
}));

vi.mock('@/lib/game/production/productionCalculator', () => ({
  buildMultipliers: vi.fn(() => ({
    extractorBonus: 0, factoryBonus: 0, t1FactoryBonus: 0, t2FactoryBonus: 0, t3FactoryBonus: 0,
    weatherProduction: 1, eventProductionGlobal: 1, eventResearch: 1,
    transportProductionBonus: 0, transportThroughputBonus: 0, transportMegaBonus: 0,
    researchBonus: 0, storageCapacityBonus: 0, marketBonus: 0,
    workerEfficiencyResearchBonus: 0, productionBonus: 0, powerEfficiency: 1,
    droneCapacityBonus: 0, droneSpeedBonus: 0, droneFuelBonus: 0,
    hasMarketAnalysis: false,
    specificBuildingBonuses: new Map(),
    modifierEngine: { resolve: vi.fn(() => 0.5) },
  })),
  computeProduction: vi.fn(() => ({
    canProduce: true, inputs: [], actualInputs: [],
    outputs: [{ resource: 'money' as string, amount: 10 }], efficiency: 1,
  })),
  computePowerGrid: vi.fn(() => ({
    totalProduction: 0, totalConsumption: 0, efficiency: 1, overload: false, fuelConsumption: [],
  })),
  computePayout: vi.fn(() => ({ amountPerCycle: 0, breakdown: { extractors: 0, factories: 0, power: 0 } })),
  computeEndgameIncome: vi.fn(() => ({ moneyPerTick: 0, researchPerTick: 0, corpPerTick: 0 })),
  computeSellMultiplier: vi.fn(() => 0.5),
  emptyProductionSnapshot: vi.fn(() => ({
    production: {}, consumption: {}, actualConsumption: {}, buildings: {},
    powerProduction: 0, powerConsumption: 0, powerEfficiency: 1, powerOverload: false,
    payoutPerCycle: 0, payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
    sellMultiplier: 0.5, endgameMoney: 0, endgameResearch: 0, endgameCorp: 0,
    moneyIncomeRate: 0, moneyExpenseRate: 0, rpIncomeRate: 0, rpExpenseRate: 0,
    cpIncomeRate: 0, cpExpenseRate: 0,
  })),
}));

vi.mock('@/lib/game/config/configCache', () => ({
  BUILDING_DEFS: HOIST_BUILDING_DEFS,
  RESOURCE_META: { iron: { name: 'Iron', icon: 'iron', tier: 1, color: '#888', category: 'raw' } },
  WEATHER_DEFS: {},
  WORKER_DEFS: {},
  TRANSPORT_DEFS: {},
  RESEARCH_TREE: HOIST_RESEARCH_TREE,
  AUTOMATION_UNLOCKS: [],
  PRESTIGE_BONUSES: [],
  RANK_THRESHOLDS: HOIST_RANK_THRESHOLDS,
  INITIAL_MARKET: HOIST_INITIAL_MARKET,
  CONTRACT_TEMPLATES: HOIST_CONTRACT_TEMPLATES,
  INITIAL_MEGA_PROJECTS: [],
  QUEST_DEFS: [],
  SEASONAL_EVENTS: [],
  WEEKLY_DAILY_REWARDS: HOIST_WEEKLY_REWARDS,
  getStreakMultiplier: vi.fn(() => 1),
  emptyProductionSnapshot: vi.fn(() => ({
    production: {}, consumption: {}, actualConsumption: {}, buildings: {},
    powerProduction: 0, powerConsumption: 0, powerEfficiency: 1, powerOverload: false,
    payoutPerCycle: 0, payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
    sellMultiplier: 0.5, endgameMoney: 0, endgameResearch: 0, endgameCorp: 0,
    moneyIncomeRate: 0, moneyExpenseRate: 0, rpIncomeRate: 0, rpExpenseRate: 0,
    cpIncomeRate: 0, cpExpenseRate: 0,
  })),
}));

vi.mock('@/lib/game/config/balance/balanceConfig', () => ({
  getBalance: vi.fn(() => ({
    storage: { upgradeCostExponent: 1.5, upgradeCapacityRatio: 0.5 },
    building: { upgradeEfficiencyGain: 0.1 },
    transport: { upgradeCostExponent: 1.5 },
    rp: { passiveBase: 1, aiLabBonus: 0.5, completionRefundRatio: 0.1, extractorRate: 0.1, powerRate: 0.05, factoryT1Rate: 0.1, factoryT2Rate: 0.2, factoryT3Rate: 0.3, factoryT4Rate: 0.4 },
    prestige: { cpPerBuilding: 10 },
    event: { randomTriggerChance: 0.01 },
    weather: { minIntensity: 0.3, intensityRange: 0.7 },
    contract: { tierRewardCoeff: 0.5, difficultyRewardCoeff: 0.2, difficultyResourceCoeff: 0.3 },
    autoSell: { thresholdRatio: 0.8, excessSellRatio: 0.1, maxSellCapacityRatio: 0.05 },
    market: { buyPriceMarkup: 1.2 },
    drone: { difficultyPerFactoryPair: 0.5, speedUpgradeCoeff: 0.2, capacityUpgradeCoeff: 0.3, fuelEfficiencyUpgradeCoeff: 0.25 },
    worker: { xpPerTick: 0.1, efficiencyGainPerTick: 0.001 },
    offline: { autoTradeThresholdRatio: 0.9, autoSellRate: 1 },
  })),
}));

vi.mock('@/lib/game/audio/soundEngine', () => ({ soundEngine: { play: vi.fn() } }));
vi.mock('@/lib/game/events/eventArchetypes', () => ({
  pickRandomArchetype: vi.fn(() => ({ id: 'test_event', name: 'Test Event', description: '', effects: [], icon: '' })),
  resolveArchetype: vi.fn(() => ({ name: 'Test', description: 'Testing', effects: [], icon: '' })),
}));
vi.mock('@/lib/game/migration/idMigration', () => ({ migrateSaveBuildings: vi.fn((b: unknown[]) => b) }));

// ─── IMPORTS ─────────────────────────────────────────────────────────

import { getBuildingCost, isResearchUnlocked, isBuildingUnlocked } from '@/lib/game/state/store';

// ─── TESTS ───────────────────────────────────────────────────────────

describe('Module: utils/costCalculator', () => {
  describe('getBuildingCost()', () => {
    it('returns Infinity for unknown type', () => {
      expect(getBuildingCost('nonexistent' as BuildingType, 0)).toBe(Infinity);
    });

    it('calculates base cost for first building', () => {
      expect(getBuildingCost('ironMine' as BuildingType, 0)).toBe(100);
    });

    it('increases cost with count', () => {
      expect(getBuildingCost('ironMine' as BuildingType, 1)).toBe(Math.floor(100 * 1.5));
    });

    it('applies cost reduction', () => {
      const base = getBuildingCost('ironMine' as BuildingType, 0);
      const reduced = getBuildingCost('ironMine' as BuildingType, 0, 0.2);
      expect(reduced).toBeLessThan(base);
    });

    it('never returns less than 1', () => {
      expect(getBuildingCost('ironMine' as BuildingType, 0, 1)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('isResearchUnlocked()', () => {
    it('returns true when no prerequisites', () => {
      expect(isResearchUnlocked('basicMetallurgy', [])).toBe(true);
    });

    it('returns false for unknown research', () => {
      expect(isResearchUnlocked('unknownResearch', [])).toBe(false);
    });
  });

  describe('isBuildingUnlocked()', () => {
    it('returns true for ironMine (no unlock)', () => {
      expect(isBuildingUnlocked('ironMine' as BuildingType, [], { totalPrestiges: 0 })).toBe(true);
    });

    it('returns false for unknown type', () => {
      expect(isBuildingUnlocked('unknown' as BuildingType, [], { totalPrestiges: 0 })).toBe(false);
    });

    it('returns false when research requirement not met', () => {
      // superFactory requires advancedManufacturing which is not completed
      expect(isBuildingUnlocked('superFactory' as BuildingType, [], { totalPrestiges: 0 })).toBe(false);
    });
  });
});



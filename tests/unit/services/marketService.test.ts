/**
 * MARKET SERVICE TESTS
 *
 * Tests market actions: sellResource, buyResource, toggleAutoSell.
 *
 * Target: services/marketService.ts (extracted from store.ts)
 * Imports: @/lib/game/state/store (current monolithic store)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResourceType } from '@/lib/game/shared/types/types';

// ═════════════════════════════════════════════════════════════════════
// HOISTED MOCK DATA
// ═════════════════════════════════════════════════════════════════════

const HOIST_BUILDING_DEFS = vi.hoisted((): Record<string, Record<string, unknown>> => ({
  ironMine:     { name: 'Iron Mine', category: 'extractor', tier: 1, baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1, outputs: [{ resource: 'iron', amount: 10 }] },
  copperMine:   { name: 'Copper Mine', category: 'extractor', tier: 1, baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1, outputs: [{ resource: 'copper', amount: 10 }] },
  smelter:      { name: 'Smelter', category: 'factory', tier: 1, baseCost: [{ resource: 'money', amount: 200 }], costMultiplier: 1.5, baseProductionRate: 1, inputs: [{ resource: 'iron', amount: 5 }], outputs: [{ resource: 'ironPlate', amount: 10 }] },
  solarFarm:    { name: 'Solar Farm', category: 'power', tier: 1, baseCost: [{ resource: 'money', amount: 300 }], costMultiplier: 1.5, baseProductionRate: 1 },
  superFactory: { name: 'Super Factory', category: 'factory', tier: 3, baseCost: [{ resource: 'money', amount: 5000 }], costMultiplier: 2, baseProductionRate: 2, inputs: [{ resource: 'steel', amount: 10 }], outputs: [{ resource: 'robotics', amount: 5 }], unlockRequirement: { research: 'advancedManufacturing' } },
}));
const HOIST_WEEKLY_REWARDS = vi.hoisted((): Record<string, unknown>[] => ([
  { day: 1, type: 'money', amount: 100 },
  { day: 2, type: 'researchPoints', amount: 50 },
  { day: 3, type: 'resources', amount: 25, resource: 'iron' },
  { day: 4, type: 'money', amount: 200 },
  { day: 5, type: 'researchPoints', amount: 100 },
  { day: 6, type: 'corporationPoints', amount: 5 },
  { day: 7, type: 'corporationPoints', amount: 15 },
]));
const HOIST_RANK_THRESHOLDS = vi.hoisted(() => [
  { name: 'Apprentice', icon: '★', color: '#888', minScore: 0 },
  { name: 'Engineer',   icon: '★★', color: '#aaa', minScore: 5000 },
  { name: 'Director',   icon: '★★★', color: '#ffd700', minScore: 25000 },
]);
const HOIST_INITIAL_MARKET = vi.hoisted(() => [
  { resource: 'iron', basePrice: 10, currentPrice: 10, priceHistory: [], demand: 0.5, supply: 0.5, volatility: 0.1 },
]);

// ─── MOCKS ──────────────────────────────────────────────────────────

vi.mock('@/lib/db/access', () => ({

  // BUG-077: canonical boundary names mirror the legacy alias.
  getDbClient: vi.fn(() => null),
  requireDbClient: () => ({ from: vi.fn() }),
  isDbClientConfigured: vi.fn(() => true),
  createClient: vi.fn(async () => null),

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
    canProduce: true, inputs: [], actualInputs: [], outputs: [], efficiency: 1,
  })),
}));

vi.mock('@/lib/game/config/configCache', () => ({
  BUILDING_DEFS: HOIST_BUILDING_DEFS,
  RESOURCE_META: { iron: { name: 'Iron', icon: 'iron', tier: 1, color: '#888', category: 'raw' } },
  WEATHER_DEFS: {},
  WORKER_DEFS: {},
  TRANSPORT_DEFS: { conveyorBelt: { name: 'Conveyor Belt', description: '', icon: '', sortOrder: 1, baseCost: [{ resource: 'money', amount: 50 }], upgradeMultiplier: 1.5, baseThroughput: 10 } },
  RESEARCH_TREE: [{ id: 'basicMetallurgy', name: 'Basic Metallurgy', description: '', category: 'production', tier: 1, cost: 100, timeRequired: 30, prerequisites: [], effects: [], icon: '', sortOrder: 1 }],
  AUTOMATION_UNLOCKS: [{ type: 'autoTrading', name: 'Auto Trading', cost: 10, requiresResearch: null, icon: '' }],
  PRESTIGE_BONUSES: [{ id: 'speedBoost', name: 'Speed Boost', cost: 5, effect: { type: 'gameSpeed', value: 0.5 } }],
  RANK_THRESHOLDS: HOIST_RANK_THRESHOLDS,
  INITIAL_MARKET: HOIST_INITIAL_MARKET,
  CONTRACT_TEMPLATES: [],
  INITIAL_MEGA_PROJECTS: [],
  QUEST_DEFS: [],
  SEASONAL_EVENTS: [],
  WEEKLY_DAILY_REWARDS: HOIST_WEEKLY_REWARDS,
  getStreakMultiplier: vi.fn((streak: number) => {
    if (streak >= 7) return 3; if (streak >= 5) return 2; if (streak >= 3) return 1.5; return 1;
  }),
  emptyProductionSnapshot: vi.fn(() => ({
    canProduce: true, inputs: [], actualInputs: [], outputs: [], efficiency: 1,
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
vi.mock('@/lib/game/migration/idMigration', () => ({ migrateSaveBuildings: vi.fn((b: unknown) => b) }));

// ─── IMPORTS ─────────────────────────────────────────────────────────

import { useGameStore } from '@/lib/game/state/store';

// ─── TEST HELPERS ────────────────────────────────────────────────────

function getStore() { return useGameStore.getState(); }
function resetStore() { useGameStore.setState(useGameStore.getInitialState()); }

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/marketService
// ═════════════════════════════════════════════════════════════════════

describe('services/marketService', () => {
  beforeEach(() => { vi.clearAllMocks(); resetStore(); });

  it('toggleAutoSell adds resource to list', () => {
    getStore().toggleAutoSell('iron' as ResourceType);
    expect(getStore().autoSellResources).toContain('iron');
  });

  it('toggleAutoSell removes resource from list', () => {
    getStore().toggleAutoSell('iron' as ResourceType);
    expect(getStore().autoSellResources).toContain('iron');
    getStore().toggleAutoSell('iron' as ResourceType);
    expect(getStore().autoSellResources).not.toContain('iron');
  });

  it('sellResource does nothing when no inventory', async () => {
    useGameStore.setState({ resources: { ...getStore().resources, iron: 0 } });
    const moneyBefore = getStore().money;
    await getStore().sellResource('iron' as ResourceType, 100);
    expect(getStore().money).toBe(moneyBefore);
  });

  it('buyResource does nothing when insufficient funds', async () => {
    useGameStore.setState({ money: 0 });
    await getStore().buyResource('iron' as ResourceType, 100);
    expect(getStore().resources.iron).toBe(0);
  });
});

/**
 * AUTOMATION SERVICE TESTS
 *
 * Tests automation actions: activateAutomation.
 *
 * Target: services/automationService.ts (extracted from store.ts as actions/automation.ts)
 * Imports: @/lib/game/state/store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResourceType } from '@/lib/game/shared/types/types';

// ─── HOISTED MOCK DATA ───────────────────────────────────────────────

const HOIST_BUILDING_DEFS = vi.hoisted(() => ({}));
const HOIST_WEEKLY_REWARDS = vi.hoisted<{ day: number; type: string; amount: number; resource?: ResourceType }[]>(() => []);
const HOIST_RANK_THRESHOLDS = vi.hoisted(() => [{ name: 'Apprentice', icon: '★', color: '#888', minScore: 0 }]);
const HOIST_INITIAL_MARKET = vi.hoisted(() => []);

// ─── MOCKS ───────────────────────────────────────────────────────────

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
  computeProduction: vi.fn(() => ({ canProduce: true, inputs: [], actualInputs: [], outputs: [{ resource: 'money' as string, amount: 10 }], efficiency: 1 })),
  computePowerGrid: vi.fn(() => ({ totalProduction: 0, totalConsumption: 0, efficiency: 1, overload: false, fuelConsumption: [] })),
  computePayout: vi.fn(() => ({ amountPerCycle: 0, breakdown: { extractors: 0, factories: 0, power: 0 } })),
  computeEndgameIncome: vi.fn(() => ({ moneyPerTick: 0, researchPerTick: 0, corpPerTick: 0 })),
  computeSellMultiplier: vi.fn(() => 0.5),
  emptyProductionSnapshot: vi.fn(() => ({ production: {}, consumption: {}, actualConsumption: {}, buildings: {}, powerProduction: 0, powerConsumption: 0, powerEfficiency: 1, powerOverload: false, payoutPerCycle: 0, payoutBreakdown: { extractors: 0, factories: 0, power: 0 }, sellMultiplier: 0.5, endgameMoney: 0, endgameResearch: 0, endgameCorp: 0, moneyIncomeRate: 0, moneyExpenseRate: 0, rpIncomeRate: 0, rpExpenseRate: 0, cpIncomeRate: 0, cpExpenseRate: 0 })),
}));

vi.mock('@/lib/game/config/configCache', () => ({
  BUILDING_DEFS: HOIST_BUILDING_DEFS,
  RESOURCE_META: {},
  WEATHER_DEFS: {},
  WORKER_DEFS: {},
  TRANSPORT_DEFS: {},
  RESEARCH_TREE: [
    { id: 'autoSorting' as any, name: 'Auto Sorting', description: '', category: 'logistics', tier: 1, cost: 100, timeRequired: 30, prerequisites: [], effects: [], icon: '', sortOrder: 1 },
  ],
  AUTOMATION_UNLOCKS: [
    { type: 'autoTrading', name: 'Auto Trading', cost: 10, requiresResearch: null, icon: '', active: false },
    { type: 'autoSorting' as any, name: 'Auto Sorting', cost: 20, requiresResearch: 'autoSorting' as any, icon: '', active: false },
    { type: 'autoCollect' as any, name: 'Auto Collect', cost: 5, requiresResearch: null, icon: '', active: false },
  ],
  PRESTIGE_BONUSES: [],
  RANK_THRESHOLDS: HOIST_RANK_THRESHOLDS,
  INITIAL_MARKET: HOIST_INITIAL_MARKET,
  CONTRACT_TEMPLATES: [],
  INITIAL_MEGA_PROJECTS: [],
  QUEST_DEFS: [],
  SEASONAL_EVENTS: [],
  WEEKLY_DAILY_REWARDS: HOIST_WEEKLY_REWARDS,
  getStreakMultiplier: vi.fn(() => 1),
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

// ─── HELPERS ─────────────────────────────────────────────────────────

function getStore() { return useGameStore.getState(); }
function resetStore() { useGameStore.setState(useGameStore.getInitialState()); }

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/automationService (actions/automation.ts)
// ═════════════════════════════════════════════════════════════════════

describe('services/automationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    // Set initial CP high enough for tests that need to spend
    useGameStore.setState({
      prestigeState: {
        corporationPoints: 50,
        totalPrestiges: 0,
        megaFactoryUnlocked: false,
        bonuses: [],
      },
    });
  });

  it('activateAutomation activates an unlocked automation', () => {
    // autoTrading starts inactive, costs 10 CP, no research requirement
    const before = getStore().prestigeState.corporationPoints;
    expect(getStore().automationUnlocks.find(a => a.type === 'autoTrading')?.active).toBe(false);

    getStore().activateAutomation('autoTrading');

    expect(getStore().automationUnlocks.find(a => a.type === 'autoTrading')?.active).toBe(true);
    expect(getStore().prestigeState.corporationPoints).toBe(before - 10);
  });

  it('activateAutomation rejects insufficient corporation points', () => {
    // Reduce CP to 0
    useGameStore.setState({
      prestigeState: {
        corporationPoints: 0,
        totalPrestiges: 0,
        megaFactoryUnlocked: false,
        bonuses: [],
      },
    });

    getStore().activateAutomation('autoTrading');

    expect(getStore().automationUnlocks.find(a => a.type === 'autoTrading')?.active).toBe(false);
    expect(getStore().prestigeState.corporationPoints).toBe(0);
  });

  it('activateAutomation does nothing if already active', () => {
    getStore().activateAutomation('autoTrading'); // Activate first time
    const cpAfterFirst = getStore().prestigeState.corporationPoints;

    getStore().activateAutomation('autoTrading'); // Second time — should be no-op

    expect(getStore().automationUnlocks.find(a => a.type === 'autoTrading')?.active).toBe(true);
    expect(getStore().prestigeState.corporationPoints).toBe(cpAfterFirst); // Not deducted again
  });

  it('activateAutomation rejects when research requirement not met', () => {
    // autoSorting requires 'autoSorting' as any research which is not completed
    getStore().activateAutomation('autoSorting' as any);

    expect(getStore().automationUnlocks.find(a => a.type === 'autoSorting' as any)?.active).toBe(false);
  });

  it('activateAutomation does nothing for unknown type', () => {
    const stateBefore = getStore().prestigeState.corporationPoints;

    getStore().activateAutomation('unknownType' as never);

    expect(getStore().prestigeState.corporationPoints).toBe(stateBefore);
  });

  it('activateAutomation autoCollect activates successfully', () => {
    expect(getStore().automationUnlocks.find(a => a.type === 'autoCollect' as any)?.active).toBe(false);

    getStore().activateAutomation('autoCollect' as any);

    expect(getStore().automationUnlocks.find(a => a.type === 'autoCollect' as any)?.active).toBe(true);
  });
});


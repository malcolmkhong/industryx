/**
 * TESTS: utils/saveMigration
 *
 * Tests for save state migration logic (migrateSaveState).
 * Maps to target: utils/saveMigration.ts
 * Imports from CURRENT store location until extraction.
 *
 * NOTE: migrateSaveState is an internal function called by Zustand's persist
 * middleware during rehydration. These tests validate migration behavior
 * through the store's public import/export API. Once extracted to its own
 * module, import migrateSaveState directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameState, ResourceType } from '@/lib/game/types';

// ═════════════════════════════════════════════════════════════════════
// HOISTED MOCK DATA
// ═════════════════════════════════════════════════════════════════════

const HOIST_BUILDING_DEFS = vi.hoisted((): Record<string, Record<string, unknown>> => ({
  ironMine: { name: 'Iron Mine', category: 'extractor', tier: 1, baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1 },
  solarFarm: { name: 'Solar Farm', category: 'power', tier: 1, baseCost: [{ resource: 'money', amount: 300 }], costMultiplier: 1.5, baseProductionRate: 1 },
  solarPanel: { name: 'Solar Panel', category: 'power', tier: 1, baseCost: [{ resource: 'money', amount: 300 }], costMultiplier: 1.5, baseProductionRate: 1 },
}));
const HOIST_WEEKLY_REWARDS = vi.hoisted((): Record<string, unknown>[] => ([
  { day: 1, type: 'money', amount: 100 },
  { day: 2, type: 'researchPoints', amount: 50 },
]));
const HOIST_RANK_THRESHOLDS = vi.hoisted((): Record<string, unknown>[] => ([
  { name: 'Apprentice', icon: '★', color: '#888', minScore: 0 },
]));
const HOIST_INITIAL_MARKET = vi.hoisted((): Record<string, unknown>[] => ([
  { resource: 'iron', basePrice: 10, currentPrice: 10, priceHistory: [], demand: 0.5, supply: 0.5, volatility: 0.1 },
]));
const HOIST_CONTRACT_TEMPLATES = vi.hoisted((): Record<string, unknown>[] => ([]));

// ─── MOCKS ──────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => null),
  createClient: vi.fn(async () => null),
  isServiceRoleConfigured: vi.fn(() => false),
  isSupabaseConfigured: vi.fn(() => false),
}));

vi.mock('@/lib/game/newsLLM', () => ({
  initNewsLLM: vi.fn(async () => {}),
  registerUpdateCallback: vi.fn(),
  getLLMState: vi.fn(() => ({ initialized: false, pendingItems: [], callbacks: [] })),
  LLMEngineState: {},
}));

vi.mock('@/lib/game/productionCalculator', () => ({
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

vi.mock('@/lib/game/configCache', () => ({
  BUILDING_DEFS: HOIST_BUILDING_DEFS,
  RESOURCE_META: { iron: { name: 'Iron', icon: 'iron', tier: 1, color: '#888', category: 'raw' } },
  WEATHER_DEFS: {},
  WORKER_DEFS: {},
  TRANSPORT_DEFS: {},
  RESEARCH_TREE: [{ id: 'basicMetallurgy', name: 'Basic Metallurgy', description: '', category: 'production', tier: 1, cost: 100, timeRequired: 30, prerequisites: [], effects: [], icon: '', sortOrder: 1 }],
  AUTOMATION_UNLOCKS: [],
  PRESTIGE_BONUSES: [],
  RANK_THRESHOLDS: HOIST_RANK_THRESHOLDS,
  INITIAL_MARKET: HOIST_INITIAL_MARKET,
  CONTRACT_TEMPLATES: HOIST_CONTRACT_TEMPLATES,
  INITIAL_MEGA_PROJECTS: [],
  QUEST_DEFS: [],
  SEASONAL_EVENTS: [],
  WEEKLY_DAILY_REWARDS: HOIST_WEEKLY_REWARDS,
  getStreakMultiplier: vi.fn((streak: number) => {
    if (streak >= 7) return 3; if (streak >= 5) return 2; if (streak >= 3) return 1.5; return 1;
  }),
  emptyProductionSnapshot: vi.fn(() => ({
    production: {}, consumption: {}, actualConsumption: {}, buildings: {},
    powerProduction: 0, powerConsumption: 0, powerEfficiency: 1, powerOverload: false,
    payoutPerCycle: 0, payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
    sellMultiplier: 0.5, endgameMoney: 0, endgameResearch: 0, endgameCorp: 0,
    moneyIncomeRate: 0, moneyExpenseRate: 0, rpIncomeRate: 0, rpExpenseRate: 0,
    cpIncomeRate: 0, cpExpenseRate: 0,
  })),
}));

vi.mock('@/lib/game/balanceConfig', () => ({
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

vi.mock('@/lib/game/soundEngine', () => ({ soundEngine: { play: vi.fn() } }));
vi.mock('@/lib/game/eventArchetypes', () => ({
  pickRandomArchetype: vi.fn(() => ({ id: 'test_event', name: 'Test Event', description: '', effects: [], icon: '' })),
  resolveArchetype: vi.fn(() => ({ name: 'Test', description: 'Testing', effects: [], icon: '' })),
}));
vi.mock('@/lib/game/idMigration', () => ({ migrateSaveBuildings: vi.fn((b: unknown[]) => b) }));

// ─── IMPORTS ─────────────────────────────────────────────────────────

import { useGameStore } from '@/lib/game/store';

// ─── TEST HELPERS ────────────────────────────────────────────────────

function getStore() { return useGameStore.getState(); }

function resetStore() { useGameStore.setState(useGameStore.getInitialState()); }

/**
 * Encode a state object to the base64+URI format used by exportSave/importSave.
 */
function encodeSave(state: Record<string, unknown>): string {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

/**
 * Create a minimal V1 save (no megaProjects, productionHistory, etc.).
 */
function createV1Save(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    money: 1000,
    gameTick: 0,
    resources: { iron: 10, copper: 5 },
    buildings: [],
    _version: 1,
    ...overrides,
  };
}

// ─── TESTS ───────────────────────────────────────────────────────────

describe('Module: utils/saveMigration', () => {
  beforeEach(resetStore);

  describe('V1 → V2: adds megaProjects and productionHistory', () => {
    it('imports V1 save successfully', () => {
      const result = getStore().importSave(encodeSave(createV1Save()));
      expect(result).toBe(true);
    });

    it('megaProjects exists after loading V1 save', () => {
      getStore().importSave(encodeSave(createV1Save()));
      expect(getStore().megaProjects).toBeDefined();
      expect(Array.isArray(getStore().megaProjects)).toBe(true);
    });

    it('productionHistory exists after loading V1 save', () => {
      getStore().importSave(encodeSave(createV1Save()));
      expect(getStore().productionHistory).toBeDefined();
      expect(Array.isArray(getStore().productionHistory)).toBe(true);
    });
  });

  describe('V4 → V5: adds loginStreak with defaults', () => {
    it('loginStreak has default values after loading V4 save', () => {
      getStore().importSave(encodeSave({ ...createV1Save(), _version: 4 }));
      const ls = getStore().loginStreak;
      expect(ls).toBeDefined();
      expect(ls.currentStreak).toBe(0);
      expect(ls.longestStreak).toBe(0);
      expect(ls.lastLoginDate).toBe('');
      expect(ls.totalLogins).toBe(0);
      expect(ls.weeklyRewards).toEqual([]);
    });
  });

  describe('V5 → V6: adds weather and quests', () => {
    it('weather exists after loading V5 save', () => {
      getStore().importSave(encodeSave({ ...createV1Save(), _version: 5 }));
      expect(getStore().weather).toBeDefined();
      expect(getStore().weather.current).toBe('clear');
    });

    it('quests exists after loading V5 save', () => {
      getStore().importSave(encodeSave({ ...createV1Save(), _version: 5 }));
      expect(getStore().quests).toBeDefined();
      expect(Array.isArray(getStore().quests)).toBe(true);
    });
  });

  describe('V14 → V15: adds productionSnapshot', () => {
    it('productionSnapshot exists after loading V14 save', () => {
      getStore().importSave(encodeSave({ ...createV1Save(), _version: 14 }));
      expect(getStore().productionSnapshot).toBeDefined();
    });
  });

  describe('V19 → V20: renames solarPanel to solarFarm', () => {
    it('loads V19 save with solarPanel buildings without rejecting', () => {
      const v19Save = createV1Save({
        _version: 19,
        buildings: [
          { id: 'b1', type: 'solarPanel', level: 1, active: true, efficiency: 1, placedAt: 0 },
        ],
      });
      expect(getStore().importSave(encodeSave(v19Save))).toBe(true);
    });

    it('preserves existing state fields through migration', () => {
      // Set initial state to known values
      useGameStore.setState({ money: 5000, buildings: [] });
      // Import V1 save
      getStore().importSave(encodeSave(createV1Save({ money: 1500 })));
      // Money should be the imported value
      expect(getStore().money).toBe(1500);
      // Resources that existed in the save should be present
      expect(getStore().resources.iron).toBe(10);
      expect(getStore().resources.copper).toBe(5);
    });
  });

  it('rejects invalid save data', () => {
    expect(getStore().importSave('invalid-base64')).toBe(false);
  });

  it('rejects save with negative money', () => {
    expect(getStore().importSave(encodeSave({ ...createV1Save(), money: -100 }))).toBe(false);
  });

  it('rejects save with excessively high money (>1e12)', () => {
    expect(getStore().importSave(encodeSave({ ...createV1Save(), money: 1e13 }))).toBe(false);
  });
});



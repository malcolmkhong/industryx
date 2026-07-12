/**
 * BASELINE: store.ts Behavioral Test Suite
 *
 * !!! DO NOT MODIFY THE IMPLEMENTATION !!!
 *
 * This suite captures the CURRENT behavior of every public API and critical
 * internal function in store.ts. It exists to freeze behavior so that
 * refactoring can proceed safely.
 *
 * The test structure mirrors the TARGET architecture (modular), not the
 * current monolithic store.ts layout. This ensures that once code is
 * extracted, the tests naturally map to their new homes.
 *
 * Target layout (see STORE_DECOMPOSITION_ARCHITECTURE.md):
 *   utils/      — Pure functions (formatNumber, generateId, costCalculator, saveMigration)
 *   constants/  — Data (initialState, gameBalance)
 *   services/   — Actions grouped by domain (building, market, tick, etc.)
 *   store/      — Composition, persistence, GameStore type
 *
 * If a test fails after a refactor, the refactor changed behavior.
 * If the behavior change is intentional, the test must be updated AFTER
 * the change is approved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameState, ResourceType, BuildingType, BuildingInstance, Contract, GameNotification, LeaderboardEntry, DroneMission, DailyReward, LoginStreak, WeatherType, MegaProjectBonusType } from '@/lib/game/shared/types/types';

// ═════════════════════════════════════════════════════════════════════
// HOISTED MOCK DATA
// ═════════════════════════════════════════════════════════════════════
// These must be defined before vi.mock() due to hoisting rules.

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
const HOIST_CONTRACT_TEMPLATES = vi.hoisted(() => [
  { name: 'Supply Iron', type: 'supply', requiredResources: [{ resource: 'iron', amount: 50 }], timeLimit: 200, rewards: { money: 500 }, icon: '', gameTier: 0 },
]);

// ─── MOCKS ──────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
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
    outputs: [{ resource: 'money' as ResourceType, amount: 10 }], efficiency: 1,
  })),
  computePowerGrid: vi.fn(() => ({
    totalProduction: 0, totalConsumption: 0, efficiency: 1, overload: false, fuelConsumption: [],
  })),
  computePayout: vi.fn(() => ({ amountPerCycle: 0, breakdown: { extractors: 0, factories: 0, power: 0 } })),
  computeEndgameIncome: vi.fn(() => ({ moneyPergameTick: 0, researchPergameTick: 0, corpPergameTick: 0 })),
  computeSellMultiplier: vi.fn(() => 0.5),
  emptyProductionSnapshot: vi.fn(() => ({
    production: {}, consumption: {}, actualConsumption: {}, buildings: {},
    powerProduction: 0, powerConsumption: 0, powerEfficiency: 1, powerOverload: false,
    payoutPerCycle: 0, payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
    sellMultiplier: 0.5, endgameMoney: 0, endgameResearch: 0, endgameCorp: 0,
    moneyIncomeRate: 0, moneyExpenseRate: 0, rpIncomeRate: 0, rpExpenseRate: 0,
    cpIncomeRate: 0, cpExpenseRate: 0,
  }))
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
  }))
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
    worker: { xpPergameTick: 0.1, efficiencyGainPergameTick: 0.001 },
    offline: { autoTradeThresholdRatio: 0.9, autoSellRate: 1 },
  })),
}));

vi.mock('@/lib/game/audio/soundEngine', () => ({ soundEngine: { play: vi.fn() } }));
vi.mock('@/lib/game/events/eventArchetypes', () => ({
  pickRandomArchetype: vi.fn(() => ({ id: 'test_event', name: 'Test Event', description: '', effects: [], icon: '' })),
  resolveArchetype: vi.fn(() => ({ name: 'Test', description: 'Testing', effects: [], icon: '' })),
}));
vi.mock('@/lib/game/migration/idMigration', () => ({ migrateSaveBuildings: vi.fn((b) => b) }));

// ─── IMPORTS ─────────────────────────────────────────────────────────

import {
  useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked,
  isResearchUnlocked, generateId, hasUnlimitedStorage,
} from '@/lib/game/state/store';

// ─── TEST HELPERS ────────────────────────────────────────────────────

function getStore() { return useGameStore.getState(); }

function createMockBuilding(type: string, overrides: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: generateId(), type: type as BuildingType, level: 1,
    active: true, efficiency: 1, placedAt: 0, ...overrides,
  };
}

function resetStore() { useGameStore.setState(useGameStore.getInitialState()); }

// ═════════════════════════════════════════════════════════════════════
// TARGET: utils/  — Pure Functions
// ═════════════════════════════════════════════════════════════════════

// This section maps to: utils/formatNumber.ts, utils/generateId.ts,
//   utils/costCalculator.ts, utils/hasUnlimitedStorage.ts

// ─── UTILS: formatNumber (target: utils/formatNumber.ts) ─────────────

describe('Module: utils/formatNumber', () => {
  it('formats 0 as "0"', () => { expect(formatNumber(0)).toBe('0'); });
  it('formats integer < 1000 as string', () => { expect(formatNumber(999)).toBe('999'); });
  it('formats 1000 as "1.00K"', () => { expect(formatNumber(1000)).toBe('1.00K'); });
  it('formats 1500 as "1.50K"', () => { expect(formatNumber(1500)).toBe('1.50K'); });
  it('formats 1e6 as "1.00M"', () => { expect(formatNumber(1_000_000)).toBe('1.00M'); });
  it('formats 1e9 as "1.00B"', () => { expect(formatNumber(1_000_000_000)).toBe('1.00B'); });
  it('formats 1e12 as "1.00T"', () => { expect(formatNumber(1_000_000_000_000)).toBe('1.00T'); });
  it('returns "∞" for Infinity', () => { expect(formatNumber(Infinity)).toBe('∞'); });
  it('returns "∞" for NaN', () => { expect(formatNumber(NaN)).toBe('∞'); });
  it('floors values >= 100', () => { expect(formatNumber(100.5)).toBe('100'); });
  it('formats 1–99 with 1 decimal', () => { expect(formatNumber(1.5)).toBe('1.5'); });
  it('formats 0–1 with 2 decimals', () => { expect(formatNumber(0.5)).toBe('0.50'); });
  it('formats negative numbers', () => { expect(formatNumber(-1000)).toBe('-1.00K'); });
});

// ─── UTILS: generateId (target: utils/generateId.ts) ────────────────

describe('Module: utils/generateId', () => {
  it('returns UUID v4', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
  it('returns unique values across 1000 calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
  it('uses crypto.randomUUID (v4 marker at pos 14)', () => {
    expect(generateId()[14]).toBe('4');
  });
});

// ─── UTILS: hasUnlimitedStorage (target: utils/hasUnlimitedStorage.ts) ─

describe('Module: utils/hasUnlimitedStorage', () => {
  it('returns false for empty array', () => { expect(hasUnlimitedStorage([])).toBe(false); });
  it('returns true when unlimitedStorage is completed', () => {
    expect(hasUnlimitedStorage([{ completed: true, bonus: { type: 'unlimitedStorage' as const } }])).toBe(true);
  });
  it('returns false when project is incomplete', () => {
    expect(hasUnlimitedStorage([{ completed: false, bonus: { type: 'unlimitedStorage' as const } }])).toBe(false);
  });
  it('returns false when different bonus type', () => {
    expect(hasUnlimitedStorage([{ completed: true, bonus: { type: 'buildingCostReduction' as const } }])).toBe(false);
  });
});

// ─── UTILS: costCalculator (target: utils/costCalculator.ts) ────────

describe('Module: utils/costCalculator', () => {
  describe('getBuildingCost()', () => {
    it('returns Infinity for unknown type', () => {
      expect(getBuildingCost('nonexistent' as BuildingType, 0)).toBe(Infinity);
    });
    it('returns base cost for first building', () => {
      expect(getBuildingCost('ironMine' as BuildingType, 0)).toBe(100);
    });
    it('scales with count via costMultiplier', () => {
      expect(getBuildingCost('ironMine' as BuildingType, 1)).toBe(Math.floor(100 * 1.5));
    });
    it('applies cost reduction', () => {
      const base = getBuildingCost('ironMine' as BuildingType, 0);
      const reduced = getBuildingCost('ironMine' as BuildingType, 0, 0.2);
      expect(reduced).toBeLessThan(base);
    });
    it('floors to minimum 1', () => {
      expect(getBuildingCost('ironMine' as BuildingType, 0, 1)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('isResearchUnlocked()', () => {
    it('returns true when no prerequisites', () => {
      expect(isResearchUnlocked('basicMetallurgy', [])).toBe(true);
    });
    it('returns false for unknown research', () => {
      expect(isResearchUnlocked('unknown', [])).toBe(false);
    });
  });

  describe('isBuildingUnlocked()', () => {
    it('returns true for building with no requirements', () => {
      expect(isBuildingUnlocked('ironMine' as BuildingType, [], { totalPrestiges: 0 })).toBe(true);
    });
    it('returns false for unknown building', () => {
      expect(isBuildingUnlocked('unknown' as BuildingType, [], { totalPrestiges: 0 })).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: constants/initialState — REMOVED (Phase 12, 2026-07-10).
//
// Initial state is now server-authoritative via
// `fetchCanonicalInitialState()` (tests/unit/initialState.server.test.ts).
// The store now starts from a minimal stub (`hydrated: false`) and is
// hydrated by `hydrateInitialState()` from GET /api/game/state/initial.
// ═════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/notificationService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/notificationService', () => {
  beforeEach(resetStore);
  it('addNotification adds one', () => {
    getStore().addNotification('success', 'Hello');
    expect(getStore().notifications).toHaveLength(1);
    expect(getStore().notifications[0].message).toBe('Hello');
  });
  it('caps at 30', () => {
    for (let i = 0; i < 35; i++) getStore().addNotification('info', `n${i}`);
    expect(getStore().notifications.length).toBeLessThanOrEqual(30);
  });
  it('markNotificationRead marks single', () => {
    getStore().addNotification('info', 'x');
    const id = getStore().notifications[0].id;
    getStore().markNotificationRead(id);
    expect(getStore().notifications[0].read).toBe(true);
  });
  it('markAllNotificationsRead marks all', () => {
    getStore().addNotification('info', 'a'); getStore().addNotification('warning', 'b');
    getStore().markAllNotificationsRead();
    expect(getStore().notifications.every(n => n.read)).toBe(true);
  });
  it('clearNotifications empties', () => {
    getStore().addNotification('info', 'x');
    getStore().clearNotifications();
    expect(getStore().notifications).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/payoutService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/payoutService', () => {
  beforeEach(resetStore);
  it('toggleAutoCollect flips', () => {
    const before = getStore().payoutConfig.autoCollect;
    getStore().toggleAutoCollect();
    expect(getStore().payoutConfig.autoCollect).toBe(!before);
  });
  it('collectPayout collects pending', () => {
    useGameStore.setState({ pendingPayout: 500 });
    const m = getStore().money;
    getStore().collectPayout();
    expect(getStore().money).toBe(m + 500);
    expect(getStore().pendingPayout).toBe(0);
  });
  it('collectPayout does nothing when 0', () => {
    const m = getStore().money;
    getStore().collectPayout();
    expect(getStore().money).toBe(m);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/leaderboardService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/leaderboardService', () => {
  beforeEach(resetStore);
  it('addLeaderboardEntry sorts by score descending', () => {
    const e1: LeaderboardEntry = { id: 'a', corporationName: '', score: 100, rank: 2, buildingsBuilt: 0, researchCompleted: 0, contractsCompleted: 0, totalMoneyEarned: 0, playTime: 0, prestigeCount: 0, rankName: '', achievedAt: 0 };
    const e2: LeaderboardEntry = { id: 'b', corporationName: '', score: 200, rank: 1, buildingsBuilt: 0, researchCompleted: 0, contractsCompleted: 0, totalMoneyEarned: 0, playTime: 0, prestigeCount: 0, rankName: '', achievedAt: 0 };
    getStore().addLeaderboardEntry(e1); getStore().addLeaderboardEntry(e2);
    expect(getStore().leaderboardEntries[0].score).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/offlineService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/offlineService', () => {
  beforeEach(resetStore);

  it('getCurrentRank returns nextRankScore > 0', () => {
    expect(getStore().getCurrentRank().nextRankScore).toBeGreaterThan(0);
  });
  it('getCurrentRank progress between 0–1', () => {
    const p = getStore().getCurrentRank().progress;
    expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1);
  });
  it('getPlayerGameTier returns 0 with no buildings', () => {
    expect(getStore().getPlayerGameTier()).toBe(0);
  });
  it('getPlayerGameTier > 0 with buildings', () => {
    useGameStore.setState({ buildings: [createMockBuilding('ironMine')] });
    expect(getStore().getPlayerGameTier()).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/newsService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/newsService', () => {
  beforeEach(resetStore);
  it('getNewsLLMState returns object', () => { expect(getStore().getNewsLLMState()).toBeDefined(); });
  it('refreshNewsFromLLM updates items', () => {
    useGameStore.setState({ marketNews: [{ id: 'n1', title: 'Old', description: '', affectedResources: [], textSource: 'fallback' as const, impactSummary: '', severity: 'low', category: 'trade', gameTick: 0 }] });
    getStore().refreshNewsFromLLM([{ id: 'n1', title: 'New', description: '', affectedResources: [], textSource: 'llm' }]);
    expect(getStore().marketNews[0].title).toBe('New');
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/buildingService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/buildingService', () => {
  beforeEach(() => { resetStore(); vi.clearAllMocks(); });
  it('selectBuilding sets/clears', () => {
    getStore().selectBuilding('b1'); expect(getStore().selectedBuilding).toBe('b1');
    getStore().selectBuilding(null); expect(getStore().selectedBuilding).toBeNull();
  });
  it('buildBuilding deducts money and adds building', async () => {
    await getStore().buildBuilding('ironMine' as BuildingType);
    expect(getStore().buildings).toHaveLength(1);
    expect(getStore().buildings[0].type).toBe('ironMine');
    expect(getStore().money).toBeLessThan(1000);
  });
  it('buildBuilding rejects when insufficient funds', async () => {
    useGameStore.setState({ money: 10 });
    await getStore().buildBuilding('ironMine' as BuildingType);
    expect(getStore().buildings).toHaveLength(0);
  });
  it('upgradeBuilding increases level', () => {
    const b = createMockBuilding('ironMine'); useGameStore.setState({ buildings: [b], money: 99999 });
    getStore().upgradeBuilding(b.id);
    expect(getStore().buildings[0].level).toBe(2);
  });
  it('upgradeBuilding no-op unknown', () => { getStore().upgradeBuilding('bad'); expect(getStore().buildings).toHaveLength(0); });
  it('toggleBuilding flips active', async () => {
    const b = createMockBuilding('ironMine'); useGameStore.setState({ buildings: [b] });
    await getStore().toggleBuilding(b.id); expect(getStore().buildings[0].active).toBe(false);
    await getStore().toggleBuilding(b.id); expect(getStore().buildings[0].active).toBe(true);
  });
  it('toggleBuilding no-op unknown', async () => { await getStore().toggleBuilding('bad'); });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/transportService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/transportService', () => {
  beforeEach(resetStore);
  it('toggleTransportLine flips active', () => {
    const line = { id: 't1', type: 'conveyorBelt', level: 1, fromBuilding: 'a', toBuilding: 'b', carriesResource: 'iron' as ResourceType, throughput: 10, maxThroughput: 30, active: true };
    useGameStore.setState({ transportLines: [line as any] });
    getStore().toggleTransportLine('t1');
    expect(getStore().transportLines[0].active).toBe(false);
  });
  it('upgradeTransportLine no-op unknown', () => { getStore().upgradeTransportLine('bad'); });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/marketService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/marketService', () => {
  beforeEach(() => { resetStore(); vi.clearAllMocks(); });
  it('toggleAutoSell toggles', () => {
    getStore().toggleAutoSell('iron'); expect(getStore().autoSellResources).toContain('iron');
    getStore().toggleAutoSell('iron'); expect(getStore().autoSellResources).not.toContain('iron');
  });
  it('sellResource does not oversell', async () => {
    useGameStore.setState({ resources: { ...getStore().resources, iron: 0 } });
    const m = getStore().money;
    await getStore().sellResource('iron', 100);
    expect(getStore().money).toBe(m);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/blueprintService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/blueprintService', () => {
  beforeEach(resetStore);
  it('saveBlueprint + deleteBlueprint', () => {
    getStore().saveBlueprint('Test');
    expect(getStore().blueprints).toHaveLength(1);
    expect(getStore().blueprints[0].name).toBe('Test');
    getStore().deleteBlueprint(getStore().blueprints[0].id);
    expect(getStore().blueprints).toHaveLength(0);
  });
  it('renameBlueprint', () => {
    getStore().saveBlueprint('A');
    getStore().renameBlueprint(getStore().blueprints[0].id, 'B');
    expect(getStore().blueprints[0].name).toBe('B');
  });
  it('exportBlueprint returns string', () => {
    getStore().saveBlueprint('X');
    expect(typeof getStore().exportBlueprint(getStore().blueprints[0].id)).toBe('string');
  });
  it('exportBlueprint empty for unknown', () => { expect(getStore().exportBlueprint('bad')).toBe(''); });
  it('importBlueprint round-trips', () => {
    getStore().saveBlueprint('Src');
    const code = getStore().exportBlueprint(getStore().blueprints[0].id);
    expect(getStore().importBlueprint(code)).toBe(true);
  });
  it('importBlueprint rejects invalid', () => { expect(getStore().importBlueprint('bad')).toBe(false); });
  it('importBlueprint rejects >500 buildings', () => {
    expect(getStore().importBlueprint(btoa(encodeURIComponent(JSON.stringify({ n: 'Huge', b: Array(501).fill({ t: 'ironMine', c: 1 }), t: [], v: 1 }))))).toBe(false);
  });
  it('importBlueprint rejects negative count', () => {
    expect(getStore().importBlueprint(btoa(encodeURIComponent(JSON.stringify({ n: 'Bad', b: [{ t: 'ironMine', c: -1 }], t: [], v: 1 }))))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/contractService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/contractService', () => {
  beforeEach(resetStore);
  it('acceptContract adds', () => {
    const c: Contract = { id: 'c1', name: 'T', type: 'supply', description: '', requiredResources: [], timeLimit: 100, timeRemaining: 100, reward: { money: 100, researchPoints: 0, corporationPoints: 0 }, difficulty: 1, gameTier: 0, progress: 0, completed: false, failed: false, icon: '' };
    getStore().acceptContract(c); expect(getStore().contracts).toHaveLength(1);
  });
  it('fulfillContract no-op unknown', () => { getStore().fulfillContract('bad'); });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/droneService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/droneService', () => {
  beforeEach(resetStore);
  it('buyDrone adds when enough money', () => {
    const n = getStore().drones.fleet.length;
    getStore().buyDrone();
    expect(getStore().drones.fleet.length).toBe(n + 1);
  });
  it('buyDrone rejected without money', () => {
    useGameStore.setState({ money: 0 }); const n = getStore().drones.fleet.length;
    getStore().buyDrone(); expect(getStore().drones.fleet.length).toBe(n);
  });
  it('sendDrone no-op with no drones', async () => { await getStore().sendDrone('m1', 'd1'); });
  it('generateDroneMissions returns array', () => {
    useGameStore.setState({ buildings: [createMockBuilding('ironMine')] });
    expect(Array.isArray(getStore().generateDroneMissions())).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/megaProjectService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/megaProjectService', () => {
  beforeEach(resetStore);
  it('startMegaProject no-op unknown', () => { getStore().startMegaProject('unknown' as any); });
  it('contributeToMegaProject no-op unknown', () => { getStore().contributeToMegaProject('unknown' as any); });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/prestigeService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/prestigeService', () => {
  beforeEach(resetStore);
  it('purchasePrestigeBonus no-op unknown', () => { getStore().purchasePrestigeBonus('bad'); });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/antiCheatService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/antiCheatService', () => {
  beforeEach(resetStore);
  it('returns false when within 10%', () => {
    useGameStore.setState({ money: 1000 }); expect(getStore().divergesFromExpected(1100)).toBe(false);
  });
  it('returns false when max <= 0', () => {
    expect(getStore().divergesFromExpected(0)).toBe(false); expect(getStore().divergesFromExpected(-1)).toBe(false);
  });
  it('returns true when >10% over', () => {
    useGameStore.setState({ money: 2000 }); expect(getStore().divergesFromExpected(1000)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/coreService (setGameSpeed, togglePause, setActiveTab)
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/coreService', () => {
  beforeEach(() => { resetStore(); vi.clearAllMocks(); });
  it('togglePause toggles', () => {
    expect(getStore().paused).toBe(false); getStore().togglePause(); expect(getStore().paused).toBe(true);
    getStore().togglePause(); expect(getStore().paused).toBe(false);
  });
  it('setActiveTab changes tab', () => { getStore().setActiveTab('market'); expect(getStore().activeTab).toBe('market'); });
  it('setGameSpeed valid', async () => { await getStore().setGameSpeed(2); expect(getStore().gameSpeed).toBe(2); });
  it('setGameSpeed rejects invalid', async () => { await getStore().setGameSpeed(3); expect(getStore().gameSpeed).toBe(1); });
  it('setGameSpeed rejects 0', async () => { await getStore().setGameSpeed(0); expect(getStore().gameSpeed).toBe(1); });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/storageService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/storageService', () => {
  beforeEach(resetStore);
  it('upgradeStorage increases capacity', () => {
    const c = getStore().resourceCapacity.iron; const l = getStore().storageUpgradeLevels.iron;
    getStore().upgradeStorage('iron', 1);
    expect(getStore().resourceCapacity.iron).toBeGreaterThan(c);
    expect(getStore().storageUpgradeLevels.iron).toBe(l + 1);
  });
  it('upgradeStorage rejected without money', () => {
    useGameStore.setState({ money: 0 }); const c = getStore().resourceCapacity.iron;
    getStore().upgradeStorage('iron', 1); expect(getStore().resourceCapacity.iron).toBe(c);
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/dailyRewardService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/dailyRewardService', () => {
  beforeEach(() => { resetStore(); vi.clearAllMocks(); });
  it('checkDailyLogin handles fetch failure gracefully', async () => { await getStore().checkDailyLogin(); });
  it('claimDailyReward handles fetch failure gracefully', async () => { await getStore().claimDailyReward(1); });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: services/questService
// ═════════════════════════════════════════════════════════════════════

describe('Module: services/questService', () => {
  beforeEach(resetStore);
  it('setTrackedQuest sets and clears', () => {
    getStore().setTrackedQuest('q1'); expect(getStore().trackedQuest).toBe('q1');
    getStore().setTrackedQuest(null); expect(getStore().trackedQuest).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// TARGET: store/composition
// ═════════════════════════════════════════════════════════════════════

describe('Module: store/composition', () => {
  beforeEach(resetStore);
  it('all action keys present', () => {
    const actions = ['setGameSpeed','togglePause','setActiveTab','buildBuilding','upgradeBuilding','toggleBuilding','selectBuilding','buildTransportLine','upgradeTransportLine','toggleTransportLine','startResearch','hireWorker','assignWorker','levelUpWorker','sellResource','buyResource','toggleAutoSell','acceptContract','fulfillContract','activateAutomation','doPrestige','purchasePrestigeBonus','addNotification','markNotificationRead','markAllNotificationsRead','clearNotifications','divergesFromExpected','getNewsLLMState','refreshNewsFromLLM','collectPayout','toggleAutoCollect','buyDrone','sendDrone','upgradeDrone','generateDroneMissions','addLeaderboardEntry','checkDailyLogin','claimDailyReward','claimQuestReward','updateQuestProgress','setTrackedQuest','upgradeStorage','getCurrentRank','getPlayerGameTier','startMegaProject','contributeToMegaProject','saveBlueprint','loadBlueprint','deleteBlueprint','renameBlueprint','exportBlueprint','importBlueprint'];
    for (const a of actions) expect(typeof (getStore() as unknown as Record<string, unknown>)[a]).toBe('function');
    expect(actions.length).toBe(52);
  });
});

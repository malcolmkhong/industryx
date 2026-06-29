import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResourceType, BuildingType, Contract, WeatherType } from '@/lib/game/types';

const mockEmptySnapshot = vi.hoisted(() => ({
  production: {}, consumption: {}, actualConsumption: {}, buildings: {},
  powerProduction: 0, powerConsumption: 0, powerEfficiency: 1, powerOverload: false,
  payoutPerCycle: 0, payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
  sellMultiplier: 0.5, endgameMoney: 0, endgameResearch: 0, endgameCorp: 0,
  moneyIncomeRate: 0, moneyExpenseRate: 0, rpIncomeRate: 0, rpExpenseRate: 0,
  cpIncomeRate: 0, cpExpenseRate: 0,
}));

const HOIST_BUILDING_DEFS = vi.hoisted((): Record<string, Record<string, unknown>> => ({
  ironMine: { name: 'Iron Mine', category: 'extractor', tier: 1, baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1, outputs: [{ resource: 'iron', amount: 10 }] },
  smelter: { name: 'Smelter', category: 'factory', tier: 1, baseCost: [{ resource: 'money', amount: 200 }], costMultiplier: 1.5, baseProductionRate: 1, inputs: [{ resource: 'iron', amount: 5 }], outputs: [{ resource: 'ironPlate', amount: 10 }] },
}));
const HOIST_WEEKLY_REWARDS = vi.hoisted((): Record<string, unknown>[] => ([]));
const HOIST_RANK_THRESHOLDS = vi.hoisted(() => [{ name: 'Apprentice', icon: '★', color: '#888', minScore: 0 }]);
const HOIST_INITIAL_MARKET = vi.hoisted((): Record<string, unknown>[] => ([
  { resource: 'iron', basePrice: 10, currentPrice: 10, priceHistory: [], demand: 0.5, supply: 0.5, volatility: 0.1 },
]));
const HOIST_CONTRACT_TEMPLATES = vi.hoisted((): Record<string, unknown>[] => ([]));

const mockBuildMultipliers = vi.fn(() => ({
  extractorBonus: 0, factoryBonus: 0, t1FactoryBonus: 0, t2FactoryBonus: 0, t3FactoryBonus: 0,
  weatherProduction: 1, eventProductionGlobal: 1, eventResearch: 1,
  transportProductionBonus: 0, transportThroughputBonus: 0, transportMegaBonus: 0,
  researchBonus: 0, storageCapacityBonus: 0, marketBonus: 0,
  workerEfficiencyResearchBonus: 0, productionBonus: 0, powerEfficiency: 1,
  droneCapacityBonus: 0, droneSpeedBonus: 0, droneFuelBonus: 0,
  hasMarketAnalysis: false,
  specificBuildingBonuses: new Map(),
  modifierEngine: { resolve: vi.fn(() => 0.5) },
}));

const mockComputeProduction = vi.fn((b: { type: string }) => {
  if (b.type === 'ironMine') {
    return { canProduce: true, inputs: [], actualInputs: [], outputs: [{ resource: 'iron' as ResourceType, amount: 10 }], efficiency: 1 };
  }
  if (b.type === 'smelter') {
    return { canProduce: true, inputs: [{ resource: 'iron' as ResourceType, amount: 5 }], actualInputs: [{ resource: 'iron' as ResourceType, amount: 5 }], outputs: [{ resource: 'ironPlate' as ResourceType, amount: 10 }], efficiency: 1 };
  }
  return { canProduce: true, inputs: [], actualInputs: [], outputs: [{ resource: 'money' as ResourceType, amount: 10 }], efficiency: 1 };
});

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
  buildMultipliers: mockBuildMultipliers,
  computeProduction: mockComputeProduction,
  computePowerGrid: vi.fn(() => ({
    totalProduction: 0, totalConsumption: 0, efficiency: 1, overload: false, fuelConsumption: [],
  })),
  computePayout: vi.fn(() => ({ amountPerCycle: 0, breakdown: { extractors: 0, factories: 0, power: 0 } })),
  computeEndgameIncome: vi.fn(() => ({ moneyPerTick: 0, researchPerTick: 0, corpPerTick: 0 })),
  computeSellMultiplier: vi.fn(() => 0.5),
  emptyProductionSnapshot,
}));

vi.mock('@/lib/game/configCache', () => ({
  BUILDING_DEFS: HOIST_BUILDING_DEFS,
  RESOURCE_META: { iron: { name: 'Iron', icon: 'iron', tier: 1, color: '#888', category: 'raw' } },
  WEATHER_DEFS: { clear: { name: 'Clear', description: '', icon: '', effects: [] } },
  WORKER_DEFS: {},
  TRANSPORT_DEFS: {},
  RESEARCH_TREE: [],
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
  emptyProductionSnapshot,
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
vi.mock('@/lib/game/idMigration', () => ({ migrateSaveBuildings: vi.fn((b: unknown) => b) }));

import { useGameStore } from '@/lib/game/store';

function getStore() { return useGameStore.getState(); }
function resetStore() { useGameStore.setState(useGameStore.getInitialState()); }

describe('Module: services/gameTick', () => {
  beforeEach(() => { resetStore(); vi.clearAllMocks(); });

  it('does nothing when paused', () => {
    useGameStore.setState({ paused: true });
    const tick = getStore().gameTick;
    getStore().gameTickAction();
    expect(getStore().gameTick).toBe(tick);
  });

  it('increments gameTick when not paused', () => {
    const tick = getStore().gameTick;
    getStore().gameTickAction();
    expect(getStore().gameTick).toBe(tick + 1);
  });

  it('updates playTime stat', () => {
    const playTime = getStore().stats.playTime;
    getStore().gameTickAction();
    expect(getStore().stats.playTime).toBe(playTime + 1);
  });

  it('keeps resources non-negative', () => {
    useGameStore.setState({ resources: { ...getStore().resources, iron: 0 } });
    getStore().gameTickAction();
    expect(getStore().resources.iron).toBeGreaterThanOrEqual(0);
  });

  it('updates lastOnlineTimestamp', () => {
    const before = getStore().lastOnlineTimestamp;
    getStore().gameTickAction();
    expect(getStore().lastOnlineTimestamp).toBeGreaterThanOrEqual(before);
  });

  it('preserves productionSnapshot after tick', () => {
    getStore().gameTickAction();
    const ps = getStore().productionSnapshot;
    expect(ps).toBeDefined();
    expect(typeof ps.powerProduction).toBe('number');
    expect(typeof ps.powerConsumption).toBe('number');
  });

  it('processes contracts with timeRemaining (decrements each tick)', () => {
    const contract: Contract = {
      id: 'c1', name: 'Test', type: 'supply', description: '',
      requiredResources: [], timeLimit: 10, timeRemaining: 5,
      reward: { money: 100, researchPoints: 0, corporationPoints: 0 },
      difficulty: 1, gameTier: 0, progress: 0, completed: false, failed: false, icon: '',
    };
    useGameStore.setState({ contracts: [contract] });
    getStore().gameTickAction();
    expect(getStore().contracts[0].timeRemaining).toBe(4);
  });

  it('updates weather when remaining expires', () => {
    useGameStore.setState({
      weather: { current: 'clear', intensity: 0, remaining: 0, nextChange: 0 },
    });
    getStore().gameTickAction();
    const validWeathers: WeatherType[] = ['clear', 'sunny', 'rainy', 'stormy', 'foggy', 'snowy'];
    expect(validWeathers).toContain(getStore().weather.current);
  });

  it('handles extractors producing resources', () => {
    const b = { id: 'b1', type: 'ironMine' as BuildingType, level: 1, active: true, efficiency: 1, placedAt: 0 };
    useGameStore.setState({ buildings: [b as any] });
    getStore().gameTickAction();
    expect(getStore().resources.iron).toBeGreaterThan(0);
  });

  it('handles factories consuming inputs and producing outputs', () => {
    const resources = { ...getStore().resources, iron: 100 };
    useGameStore.setState({ resources });
    const b = { id: 'b1', type: 'smelter' as BuildingType, level: 1, active: true, efficiency: 1, placedAt: 0 };
    useGameStore.setState({ buildings: [b as any] });
    getStore().gameTickAction();
    expect(getStore().resources.iron).toBeLessThan(100);
    expect(getStore().resources.ironPlate).toBeGreaterThan(0);
  });
});

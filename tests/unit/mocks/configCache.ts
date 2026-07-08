/**
 * tests/unit/mocks/configCache.ts
 * Shared mock factory for game configCache.
 * Provides default BUILDING_DEFS, RESEARCH_TREE, RANK_THRESHOLDS, etc.
 *
 * Use these factories in vi.mock('@/lib/game/configCache', () => createMockConfigCache(...)),
 * or merge into your own hoisted mock data.
 */

import type { ResourceType } from '@/lib/game/types';

export function createMockBuildingDefs(): Record<string, Record<string, unknown>> {
  return {
    ironMine:     { name: 'Iron Mine', category: 'extractor', tier: 1, baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1, outputs: [{ resource: 'iron', amount: 10 }] },
    copperMine:   { name: 'Copper Mine', category: 'extractor', tier: 1, baseCost: [{ resource: 'money', amount: 100 }], costMultiplier: 1.5, baseProductionRate: 1, outputs: [{ resource: 'copper', amount: 10 }] },
    smelter:      { name: 'Smelter', category: 'factory', tier: 1, baseCost: [{ resource: 'money', amount: 200 }], costMultiplier: 1.5, baseProductionRate: 1, inputs: [{ resource: 'iron', amount: 5 }], outputs: [{ resource: 'ironPlate', amount: 10 }] },
    solarFarm:    { name: 'Solar Farm', category: 'power', tier: 1, baseCost: [{ resource: 'money', amount: 300 }], costMultiplier: 1.5, baseProductionRate: 1 },
    superFactory: { name: 'Super Factory', category: 'factory', tier: 3, baseCost: [{ resource: 'money', amount: 5000 }], costMultiplier: 2, baseProductionRate: 2, inputs: [{ resource: 'steel', amount: 10 }], outputs: [{ resource: 'robotics', amount: 5 }], unlockRequirement: { research: 'advancedManufacturing' } },
  };
}

export function createMockWeeklyRewards(): { day: number; type: string; amount: number; resource?: ResourceType }[] {
  return [
    { day: 1, type: 'money', amount: 100 },
    { day: 2, type: 'researchPoints', amount: 50 },
    { day: 3, type: 'resources', amount: 25, resource: 'iron' as ResourceType },
    { day: 4, type: 'money', amount: 200 },
    { day: 5, type: 'researchPoints', amount: 100 },
    { day: 6, type: 'corporationPoints', amount: 5 },
    { day: 7, type: 'corporationPoints', amount: 15 },
  ];
}

export function createMockRankThresholds(): { name: string; icon: string; color: string; minScore: number }[] {
  return [
    { name: 'Apprentice', icon: '★', color: '#888', minScore: 0 },
    { name: 'Engineer',   icon: '★★', color: '#aaa', minScore: 5000 },
    { name: 'Director',   icon: '★★★', color: '#ffd700', minScore: 25000 },
  ];
}

export function createMockInitialMarket(): { resource: string; basePrice: number; currentPrice: number; priceHistory: number[]; demand: number; supply: number; volatility: number }[] {
  return [
    { resource: 'iron', basePrice: 10, currentPrice: 10, priceHistory: [], demand: 0.5, supply: 0.5, volatility: 0.1 },
  ];
}

export function createMockContractTemplates(): { name: string; type: string; requiredResources: { resource: string; amount: number }[]; timeLimit: number; reward: { money: number }; icon: string; gameTier: number }[] {
  return [
    { name: 'Supply Iron', type: 'delivery', requiredResources: [{ resource: 'iron', amount: 100 }], timeLimit: 200, reward: { money: 500 }, icon: 'box', gameTier: 0 },
  ];
}

export function createMockConfigCache() {
  const bd = createMockBuildingDefs();
  const wr = createMockWeeklyRewards();
  const rt = createMockRankThresholds();
  const im = createMockInitialMarket();

  return {
    BUILDING_DEFS: bd,
    RESOURCE_META: { iron: { name: 'Iron', icon: 'iron', tier: 1, color: '#888', category: 'raw' } },
    WEATHER_DEFS: {},
    WORKER_DEFS: {},
    TRANSPORT_DEFS: { conveyorBelt: { name: 'Conveyor Belt', description: '', icon: '', sortOrder: 1, baseCost: [{ resource: 'money', amount: 50 }], upgradeMultiplier: 1.5, baseThroughput: 10 } },
    RESEARCH_TREE: [{ id: 'basicMetallurgy', name: 'Basic Metallurgy', description: '', category: 'production', tier: 1, cost: 100, timeRequired: 30, prerequisites: [], effects: [], icon: '', sortOrder: 1 }],
    AUTOMATION_UNLOCKS: [{ type: 'autoTrading', name: 'Auto Trading', cost: 10, requiresResearch: null, icon: '' }],
    PRESTIGE_BONUSES: [{ id: 'speedBoost', name: 'Speed Boost', cost: 5, effect: { type: 'gameSpeed', value: 0.5 } }],
    RANK_THRESHOLDS: rt,
    INITIAL_MARKET: im,
    CONTRACT_TEMPLATES: [],
    INITIAL_MEGA_PROJECTS: [],
    QUEST_DEFS: [],
    SEASONAL_EVENTS: [],
    WEEKLY_DAILY_REWARDS: wr,
    getStreakMultiplier: (streak: number) => { if (streak >= 7) return 3; if (streak >= 5) return 2; if (streak >= 3) return 1.5; return 1; },
  };
}

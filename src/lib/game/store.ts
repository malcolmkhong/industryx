// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Zustand Game Store + Game Engine
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  simulateMarketTick, recordPlayerSell, recordPlayerBuy, createInitialSimState,
  MarketSimulationState, MarketSector,
} from './marketSimulator';
import { initNewsLLM, addEventToBatch, registerUpdateCallback, updateGameDay, getLLMState, LLMEngineState } from './newsLLM';
import {
  GameState, GameTab, ResourceType, BuildingInstance, BuildingType,
  TransportLine, TransportType, Worker, WorkerType, Contract,
  GameEvent, GameNotification, PowerGrid, MarketPrice, MegaProjectType, MegaProjectBonusType,
  Blueprint, LeaderboardEntry, LoginStreak, DailyReward,
  WeatherType, PayoutConfig, PayoutRecord, Drone, DroneMission,
} from './types';
import {
  BUILDING_DEFS, TRANSPORT_DEFS, WORKER_DEFS, INITIAL_MARKET,
  RESEARCH_TREE, AUTOMATION_UNLOCKS, PRESTIGE_BONUSES,
  EVENT_TEMPLATES, CONTRACT_TEMPLATES, RESOURCE_META,
  INITIAL_MEGA_PROJECTS, RANK_THRESHOLDS, SEASONAL_EVENTS,
  WEEKLY_DAILY_REWARDS, getStreakMultiplier,
  WEATHER_DEFS, QUEST_DEFS,
} from './configCache';
import { migrateSaveBuildings } from './idMigration';
import { soundEngine } from './soundEngine';
import {
  buildMultipliers,
  computePowerGrid,
  computeProduction,
  computeSellMultiplier,
  computePayout,
  computeEndgameIncome,
  emptyProductionSnapshot,
  MultiplierCache,
  BuildResult,
  ProductionSnapshot,
} from './productionCalculator';
import { getBalance } from './balanceConfig';

// --- Save Version ---
const SAVE_VERSION = 19;

// --- Utility Functions ---
function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Helper to compute total bonus value from completed mega projects for a given bonus type
function getMegaProjectBonus(megaProjects: { completed: boolean; bonus: { type: MegaProjectBonusType; value: number } }[], bonusType: MegaProjectBonusType): number {
  return megaProjects.filter(p => p.completed && p.bonus.type === bonusType).reduce((sum, p) => sum + p.bonus.value, 0);
}

// Check if unlimited storage is unlocked via completed mega project
export function hasUnlimitedStorage(megaProjects: { completed: boolean; bonus: { type: MegaProjectBonusType } }[]): boolean {
  return megaProjects.some(p => p.completed && p.bonus.type === 'unlimitedStorage');
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  if (Number.isInteger(n) && n >= 1) return n.toString();
  if (n >= 100) return Math.floor(n).toString();
  if (n >= 1) return n.toFixed(1);
  if (n > 0) return n.toFixed(2);
  return '0';
}

function getBuildingCost(type: BuildingType, currentCount: number, costReduction: number = 0): number {
  const def = BUILDING_DEFS[type];
  if (!def) return Infinity;
  const baseMoneyCost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 0;
  const rawCost = Math.floor(baseMoneyCost * Math.pow(def.costMultiplier, currentCount));
  return Math.max(1, Math.floor(rawCost * (1 - costReduction)));
}

function isResearchUnlocked(researchId: string, completedResearch: string[]): boolean {
  const node = RESEARCH_TREE.find(r => r.id === researchId);
  if (!node) return false;
  return node.prerequisites.every(pre => completedResearch.includes(pre));
}

function isBuildingUnlocked(type: BuildingType, completedResearch: string[], prestigeState: { totalPrestiges: number }): boolean {
  const def = BUILDING_DEFS[type];
  if (!def) return false;
  if (!def.unlockRequirement) return true;
  if (def.unlockRequirement.research && !completedResearch.includes(def.unlockRequirement.research)) return false;
  if (def.unlockRequirement.prestige && prestigeState.totalPrestiges < def.unlockRequirement.prestige) return false;
  return true;
}

function getCapacity(state: GameState, resource: ResourceType, _researchSet?: Set<string>, cache?: MultiplierCache): number {
  // Unlimited storage from Terraforming Engine mega project
  const hasUnlimitedStorage = state.megaProjects.some(p => p.completed && p.bonus.type === 'unlimitedStorage');
  if (hasUnlimitedStorage) return Infinity;

  const baseCapacity = state.resourceCapacity[resource] ?? 50;
  // Always use modifier engine for storage capacity — build cache on demand if not provided
  const effectiveCache = cache ?? buildMultipliers(state);
  return Math.floor(baseCapacity * (1 + effectiveCache.storageCapacityBonus));
}

// --- Drone Mission Generator ---
function generateDroneMissionsFromState(state: GameState): DroneMission[] {
  const missions: DroneMission[] = [];
  const buildingTypes = [...new Set(state.buildings.map(b => b.type))];

  if (buildingTypes.length < 2) return missions;

  // Generate missions from extractor → factory and factory → factory
  const extractors = buildingTypes.filter(t => BUILDING_DEFS[t]?.category === 'extractor');
  const factories = buildingTypes.filter(t => BUILDING_DEFS[t]?.category === 'factory');

  // Extractor to Factory missions
  extractors.forEach((from, i) => {
    const fromDef = BUILDING_DEFS[from];
    if (!fromDef) return;
    const targetFactories = factories.length > 0 ? factories : extractors.filter(t => t !== from);
    targetFactories.forEach((to, j) => {
      const toDef = BUILDING_DEFS[to];
      if (!toDef) return;
      const difficulty = 1 + i + j * getBalance().drone.difficultyPerFactoryPair;
      const moneyReward = Math.floor(200 * difficulty + state.buildings.filter(b => b.type === from).length * 50);
      const rpReward = Math.floor(5 * difficulty);
      missions.push({
        id: `drone-mission-${from}-${to}`,
        fromBuilding: fromDef.name,
        toBuilding: toDef.name,
        reward: { money: moneyReward, researchPoints: rpReward },
        fuelCost: Math.floor(50 + difficulty * 30),
        baseTicks: Math.floor(60 + difficulty * 40),
      });
    });
  });

  // Factory to Factory missions (higher tier)
  if (factories.length >= 2) {
    for (let i = 0; i < factories.length; i++) {
      for (let j = i + 1; j < factories.length; j++) {
        const fromDef = BUILDING_DEFS[factories[i]];
        const toDef = BUILDING_DEFS[factories[j]];
        if (!fromDef || !toDef) continue;
        const difficulty = 2 + fromDef.tier + toDef.tier;
        const moneyReward = Math.floor(500 * difficulty);
        const rpReward = Math.floor(10 * difficulty);
        const resourceReward = fromDef.outputs?.[0]?.resource;
        missions.push({
          id: `drone-mission-${factories[i]}-${factories[j]}`,
          fromBuilding: fromDef.name,
          toBuilding: toDef.name,
          reward: {
            money: moneyReward,
            researchPoints: rpReward,
            resources: resourceReward && resourceReward !== 'money' ? [{
              resource: resourceReward as ResourceType,
              amount: Math.floor(3 * difficulty),
            }] : undefined,
          },
          fuelCost: Math.floor(100 + difficulty * 40),
          baseTicks: Math.floor(80 + difficulty * 50),
        });
      }
    }
  }

  return missions.slice(0, 8); // Max 8 missions at a time
}

// --- Save Migration ---
function migrateSaveState(savedState: Record<string, unknown>, fromVersion?: number): Record<string, unknown> {
  const version = (savedState._version as number) || fromVersion || 1;
  let state = { ...savedState };

  // V1 → V2: Add megaProjects field and productionHistory
  if (version < 2) {
    if (!state.megaProjects) {
      state.megaProjects = INITIAL_MEGA_PROJECTS.map(p => ({
        ...p,
        stages: p.stages.map((s: Record<string, unknown>) => ({ ...s })),
      }));
    }
    if (!state.productionHistory) {
      state.productionHistory = [];
    }
  }

  // V2 → V3: Add storageUpgradeLevels and lastOnlineTimestamp
  if (version < 3) {
    if (!state.storageUpgradeLevels) {
      const zeroUpgrades: Record<string, number> = {};
      (Object.keys(initialResources) as ResourceType[]).forEach(r => {
        zeroUpgrades[r] = 0;
      });
      state.storageUpgradeLevels = zeroUpgrades;
    }
    if (!state.lastOnlineTimestamp) {
      state.lastOnlineTimestamp = Date.now();
    }
    if (!state.autoSellResources) {
      state.autoSellResources = [];
    }
  }

  // V3 → V4: Add leaderboardEntries (celebrations removed)
  if (version < 4) {
    if (!state.leaderboardEntries) {
      state.leaderboardEntries = [];
    }
  }

  // V4 → V5: Add loginStreak
  if (version < 5) {
    if (!state.loginStreak) {
      state.loginStreak = {
        currentStreak: 0,
        longestStreak: 0,
        lastLoginDate: '',
        totalLogins: 0,
        weeklyRewards: [],
      };
    }
  }

  // V5 → V6: Add weather and quests
  if (version < 6) {
    if (!state.weather) {
      state.weather = {
        current: 'clear',
        intensity: 0,
        remaining: 0,
        nextChange: 100 + Math.floor(Math.random() * 200),
      };
    }
    if (!state.quests) {
      state.quests = [];
    }
  }

  // V6 → V7: Add payout system
  if (version < 7) {
    if (!state.payoutConfig) {
      state.payoutConfig = {
        basePayoutInterval: 100,
        lastPayoutTick: 0,
        totalPayoutsReceived: 0,
        autoCollect: true,
      };
    }
    if (state.pendingPayout === undefined) {
      state.pendingPayout = 0;
    }
    if (!state.payoutHistory) {
      state.payoutHistory = [];
    }
  }

  // V7 → V8: Add trackedQuest
  if (version < 8) {
    if (state.trackedQuest === undefined) {
      state.trackedQuest = null;
    }
  }

  // V8 → V9: Add drone delivery system
  if (version < 9) {
    if (!state.drones) {
      state.drones = {
        fleet: [{
          id: generateId(),
          status: 'idle' as const,
          missionEndTick: 0,
          missionId: null,
          speedLevel: 1,
          capacityLevel: 1,
          fuelEfficiencyLevel: 1,
        }],
        completedMissions: 0,
        totalEarned: 0,
      };
    }
  }

  // V9 → V10: Add new resources and their capacities/stats/market entries
  if (version < 10) {
    const newResources: Record<string, number> = {
      clay: 0, limestone: 0, gravel: 0, bauxite: 0, wolframite: 0,
      bricks: 0, concrete: 0, fertilizer: 0, fossilFuel: 0,
      silicon: 0, aluminium: 0, insecticide: 0, copperIngot: 0, titanium: 0,
      coolant: 0, fiberOptics: 0, solarCell: 0,
      electronics: 0, medicalTech: 0, jewellery: 0, tungsten: 0, weapons: 0,
      scanDrone: 0, artifactDetector: 0, neuralNetwork: 0,
    };
    const newCapacities: Record<string, number> = {
      clay: 500, limestone: 500, gravel: 500, bauxite: 200, wolframite: 100,
      bricks: 200, concrete: 200, fertilizer: 200, fossilFuel: 200,
      silicon: 100, aluminium: 100, insecticide: 100, copperIngot: 100, titanium: 100,
      coolant: 100, fiberOptics: 100, solarCell: 100,
      electronics: 50, medicalTech: 50, jewellery: 25, tungsten: 50, weapons: 50,
      scanDrone: 25, artifactDetector: 25, neuralNetwork: 25,
    };

    // Add missing resource keys
    if (state.resources && typeof state.resources === 'object') {
      const resources = state.resources as Record<string, number>;
      Object.entries(newResources).forEach(([key, value]) => {
        if (resources[key] === undefined) {
          resources[key] = value;
        }
      });
      state.resources = resources;
    }

    // Add missing resourceCapacity keys
    if (state.resourceCapacity && typeof state.resourceCapacity === 'object') {
      const cap = state.resourceCapacity as Record<string, number>;
      Object.entries(newCapacities).forEach(([key, value]) => {
        if (cap[key] === undefined) {
          cap[key] = value;
        }
      });
      state.resourceCapacity = cap;
    }

    // Add missing stats.totalResourcesProduced keys
    if (state.stats && typeof state.stats === 'object') {
      const stats = state.stats as Record<string, unknown>;
      if (stats.totalResourcesProduced && typeof stats.totalResourcesProduced === 'object') {
        const produced = stats.totalResourcesProduced as Record<string, number>;
        Object.entries(newResources).forEach(([key, value]) => {
          if (produced[key] === undefined) {
            produced[key] = value;
          }
        });
        stats.totalResourcesProduced = produced;
      }
      if (stats.totalResourcesSold && typeof stats.totalResourcesSold === 'object') {
        const sold = stats.totalResourcesSold as Record<string, number>;
        Object.entries(newResources).forEach(([key, value]) => {
          if (sold[key] === undefined) {
            sold[key] = value;
          }
        });
        stats.totalResourcesSold = sold;
      }
    }

    // Add missing storageUpgradeLevels keys
    if (state.storageUpgradeLevels && typeof state.storageUpgradeLevels === 'object') {
      const upgrades = state.storageUpgradeLevels as Record<string, number>;
      Object.entries(newResources).forEach(([key]) => {
        if (upgrades[key] === undefined) {
          upgrades[key] = 0;
        }
      });
      state.storageUpgradeLevels = upgrades;
    }

    // Add missing market entries for new resources
    if (Array.isArray(state.market)) {
      const existingResources = new Set((state.market as MarketPrice[]).map((m: MarketPrice) => m.resource));
      const newMarketEntries: MarketPrice[] = [];
      INITIAL_MARKET.forEach(m => {
        if (!existingResources.has(m.resource)) {
          newMarketEntries.push({ ...m });
        }
      });
      if (newMarketEntries.length > 0) {
        state.market = [...(state.market as MarketPrice[]), ...newMarketEntries];
      }
    }
  }

  // V10 → V11: Add T4 resources
  if (version < 11) {
    const t4Resources = ['singularityCore', 'darkMatterCell', 'warpDrive', 'antimatter', 'chronoPart', 'plasmaCore', 'megaStructure', 'voidCrystal'];

    // Ensure T4 resources exist in resources object
    if (state.resources && typeof state.resources === 'object') {
      for (const res of t4Resources) {
        if (!(res in (state.resources as Record<string, number>))) {
          (state.resources as Record<string, number>)[res] = 0;
        }
      }
    }

    // Ensure T4 resources exist in resourceCapacity
    if (state.resourceCapacity && typeof state.resourceCapacity === 'object') {
      for (const res of t4Resources) {
        if (!(res in (state.resourceCapacity as Record<string, number>))) {
          (state.resourceCapacity as Record<string, number>)[res] = 50;
        }
      }
    }

    // Ensure T4 resources exist in storageUpgradeLevels
    if (state.storageUpgradeLevels && typeof state.storageUpgradeLevels === 'object') {
      for (const res of t4Resources) {
        if (!(res in (state.storageUpgradeLevels as Record<string, number>))) {
          (state.storageUpgradeLevels as Record<string, number>)[res] = 0;
        }
      }
    }

    // Ensure T4 resources exist in stats tracking
    if (state.stats) {
      const stats = state.stats as Record<string, unknown>;
      if (stats.totalResourcesProduced && typeof stats.totalResourcesProduced === 'object') {
        for (const res of t4Resources) {
          if (!(res in (stats.totalResourcesProduced as Record<string, number>))) {
            (stats.totalResourcesProduced as Record<string, number>)[res] = 0;
          }
        }
      }
      if (stats.totalResourcesSold && typeof stats.totalResourcesSold === 'object') {
        for (const res of t4Resources) {
          if (!(res in (stats.totalResourcesSold as Record<string, number>))) {
            (stats.totalResourcesSold as Record<string, number>)[res] = 0;
          }
        }
      }
    }

    // Add missing market entries for T4 resources
    if (Array.isArray(state.market)) {
      const existingResources = new Set((state.market as MarketPrice[]).map((m: MarketPrice) => m.resource));
      const newMarketEntries: MarketPrice[] = [];
      INITIAL_MARKET.forEach(m => {
        if (!existingResources.has(m.resource)) {
          newMarketEntries.push({ ...m });
        }
      });
      if (newMarketEntries.length > 0) {
        state.market = [...(state.market as MarketPrice[]), ...newMarketEntries];
      }
    }
  }

  // V12 → V13: Phase 3 economy rebalance — comprehensive market price overhaul + endgame building fix
  if (version < 13) {
    // Complete market price rebalance for consistent margins across all tiers
    const priceUpdates: Record<string, number> = {
      // T1
      plastic: 30, fossilFuel: 40,
      // T2
      circuit: 150, engine: 300, battery: 140, silicon: 75, aluminium: 70, titanium: 300, solarCell: 150,
      // T3
      aiChip: 1200, robotics: 5000, quantumPart: 25000, nanoMaterial: 50000,
      electronics: 600, medicalTech: 1500, scanDrone: 5000, artifactDetector: 12000, neuralNetwork: 3500,
      // T4
      singularityCore: 150000, darkMatterCell: 160000, warpDrive: 180000,
      antimatter: 8000, chronoPart: 500000, plasmaCore: 8000, megaStructure: 5000, voidCrystal: 250000,
    };

    if (Array.isArray(state.market)) {
      const market = state.market as MarketPrice[];
      for (const entry of market) {
        const newPrice = priceUpdates[entry.resource];
        if (newPrice !== undefined) {
          entry.basePrice = newPrice;
          entry.currentPrice = newPrice;
          entry.priceHistory = [];
        }
      }
      state.market = market;
    }

    // Endgame buildings no longer have resource inputs/outputs — handled by BUILDING_DEFS update
    // Existing buildings keep their type, tick code handles them via the passive income section
  }

  // V13 → V14: Add 4 new mega projects, fix resource repeats, change to resource-check model
  if (version < 14) {
    // Reset all mega projects to new definitions (resource lists changed, new projects added)
    // Preserve completion status and progress of existing projects by type
    const existingProjects = (state.megaProjects || []) as { type: string; active: boolean; completed: boolean; progress: number; currentStage: number; stages: { completed: boolean }[] }[];
    state.megaProjects = INITIAL_MEGA_PROJECTS.map(p => {
      const existing = existingProjects.find(ep => ep.type === p.type);
      if (existing) {
        // Preserve state from existing project, but use new stage definitions
        return {
          ...p,
          active: existing.active,
          completed: existing.completed,
          progress: existing.completed ? 0 : existing.progress,
          currentStage: existing.currentStage,
          stages: p.stages.map((s, i) => ({
            ...s,
            completed: i < existing.currentStage || existing.completed,
          })),
        };
      }
      // New project — use default state
      return p;
    });
  }

  // V14 → V15: Add productionSnapshot to GameState (economy refactor Phase 2)
  if (version < 15) {
    (state as Record<string, unknown>).productionSnapshot = emptyProductionSnapshot();
  }

  // V15 → V16: Add marketSimState + sectorTrends (supply-demand market model)
  if (version < 16) {
    (state as Record<string, unknown>).marketSimState = createInitialSimState();
    (state as Record<string, unknown>).sectorTrends = {};
  }

  // V16 → V17: Add marketNews + marketNarratives (MVIL + News + Narrative overlay layers)
  if (version < 17) {
    (state as Record<string, unknown>).marketNews = [];
    (state as Record<string, unknown>).marketNarratives = [];
  }

  // V17 → V18: Add lastTradeTick to marketSimState (trade freshness tracking)
  if (version < 18) {
    const simState = state.marketSimState as Record<string, unknown> | undefined;
    if (simState && !simState.lastTradeTick) {
      simState.lastTradeTick = {};
    }
  }

  // V17→V18+ Building ID migration (miningDrill→ironMine, quarry→sandMine, goldsmith→jewelleryForge)
  if (version < 18) {
    if (Array.isArray(state.buildings)) {
      state.buildings = migrateSaveBuildings(state.buildings as any[]);
    }
  }

  // V18 → V19: Add missing T2-T5 resources (silver, gold, powerCell, etc.)
  if (version < 19) {
    const newResourcesV19: Record<string, number> = {
      // T0
      silver: 0, gold: 0,
      // T2
      powerCell: 0, reinforcedConcrete: 0, refinedSilver: 0, refinedGold: 0,
      // T3
      carbonComposite: 0, structuralFrame: 0, fusionCell: 0, solarPanel: 0, creditChip: 0,
      // T4
      arcologyModule: 0, habitatModule: 0, stellarEnergy: 0, luxuryGoods: 0,
      tradeContract: 0, teleporterNode: 0,
      // T5
      researchMatrix: 0, worldCore: 0, shieldMatrix: 0, stellarForge: 0,
      voidEnergy: 0, marketDominance: 0, corpCapital: 0,
      dimensionalGate: 0, armadaFleet: 0,
    };
    const newCapacitiesV19: Record<string, number> = {
      silver: 100, gold: 100,
      powerCell: 100, reinforcedConcrete: 200, refinedSilver: 50, refinedGold: 50,
      carbonComposite: 25, structuralFrame: 25, fusionCell: 25, solarPanel: 50, creditChip: 25,
      arcologyModule: 25, habitatModule: 25, stellarEnergy: 25, luxuryGoods: 25,
      tradeContract: 25, teleporterNode: 25,
      researchMatrix: 10, worldCore: 10, shieldMatrix: 10, stellarForge: 10,
      voidEnergy: 10, marketDominance: 10, corpCapital: 10,
      dimensionalGate: 10, armadaFleet: 10,
    };

    if (state.resources && typeof state.resources === 'object') {
      const resources = state.resources as Record<string, number>;
      Object.entries(newResourcesV19).forEach(([key, value]) => {
        if (resources[key] === undefined) resources[key] = value;
      });
    }
    if (state.resourceCapacity && typeof state.resourceCapacity === 'object') {
      const cap = state.resourceCapacity as Record<string, number>;
      Object.entries(newCapacitiesV19).forEach(([key, value]) => {
        if (cap[key] === undefined) cap[key] = value;
      });
    }
    if (state.storageUpgradeLevels && typeof state.storageUpgradeLevels === 'object') {
      const upgrades = state.storageUpgradeLevels as Record<string, number>;
      Object.keys(newResourcesV19).forEach(key => {
        if (upgrades[key] === undefined) upgrades[key] = 0;
      });
    }
    if (state.stats && typeof state.stats === 'object') {
      const stats = state.stats as Record<string, unknown>;
      if (stats.totalResourcesProduced && typeof stats.totalResourcesProduced === 'object') {
        const produced = stats.totalResourcesProduced as Record<string, number>;
        Object.keys(newResourcesV19).forEach(key => {
          if (produced[key] === undefined) produced[key] = 0;
        });
      }
      if (stats.totalResourcesSold && typeof stats.totalResourcesSold === 'object') {
        const sold = stats.totalResourcesSold as Record<string, number>;
        Object.keys(newResourcesV19).forEach(key => {
          if (sold[key] === undefined) sold[key] = 0;
        });
      }
    }

    // Also add missing market entries for new resources
    if (Array.isArray(state.market)) {
      const existingResources = new Set((state.market as MarketPrice[]).map((m: MarketPrice) => m.resource));
      const newMarketEntries: MarketPrice[] = [];
      INITIAL_MARKET.forEach(m => {
        if (!existingResources.has(m.resource)) {
          newMarketEntries.push({ ...m });
        }
      });
      if (newMarketEntries.length > 0) {
        state.market = [...(state.market as MarketPrice[]), ...newMarketEntries];
      }
    }
  }

  state._version = SAVE_VERSION;
  return state;
}

// --- Initial State ---
const initialResources: Record<ResourceType, number> = {
  // T0 - Raw Resources
  iron: 0, copper: 0, coal: 0, oil: 0, sand: 0, lithium: 0, water: 0,
  clay: 0, limestone: 0, gravel: 0, bauxite: 0, wolframite: 0,
  silver: 0, gold: 0,
  // T1 - Basic Processed
  rareEarth: 0,
  ironPlate: 0, copperWire: 0, plastic: 0, glass: 0, carbon: 0,
  bricks: 0, concrete: 0, fertilizer: 0, steel: 0, fossilFuel: 0,
  // T2 - Intermediate
  circuit: 0, engine: 0, battery: 0, gear: 0,
  silicon: 0, aluminium: 0, insecticide: 0, copperIngot: 0, titanium: 0,
  coolant: 0, fiberOptics: 0, solarCell: 0,
  powerCell: 0, reinforcedConcrete: 0, refinedSilver: 0, refinedGold: 0,
  // T3 - Advanced
  aiChip: 0, robotics: 0, quantumPart: 0, advancedAlloy: 0, nanoMaterial: 0,
  electronics: 0, medicalTech: 0, jewellery: 0, tungsten: 0, weapons: 0,
  scanDrone: 0, artifactDetector: 0, neuralNetwork: 0,
  carbonComposite: 0, structuralFrame: 0, fusionCell: 0, solarPanel: 0, creditChip: 0,
  // T4 - Endgame
  singularityCore: 0, darkMatterCell: 0, warpDrive: 0, antimatter: 0, chronoPart: 0,
  plasmaCore: 0, megaStructure: 0, voidCrystal: 0,
  arcologyModule: 0, habitatModule: 0, stellarEnergy: 0, luxuryGoods: 0,
  tradeContract: 0, teleporterNode: 0,
  // T5 - Transcendent
  researchMatrix: 0, worldCore: 0, shieldMatrix: 0, stellarForge: 0,
  voidEnergy: 0, marketDominance: 0, corpCapital: 0,
  dimensionalGate: 0, armadaFleet: 0,
};

const initialCapacity: Record<ResourceType, number> = {
  // T0 - Raw Resources
  iron: 100, copper: 100, coal: 100, oil: 100, sand: 100, lithium: 50, water: 200,
  clay: 500, limestone: 500, gravel: 500, bauxite: 200, wolframite: 100,
  silver: 100, gold: 100,
  // T1 - Basic Processed
  rareEarth: 20,
  ironPlate: 50, copperWire: 50, plastic: 50, glass: 50, carbon: 30,
  bricks: 200, concrete: 200, fertilizer: 200, steel: 40, fossilFuel: 200,
  // T2 - Intermediate
  circuit: 30, engine: 20, battery: 30, gear: 40,
  silicon: 100, aluminium: 100, insecticide: 100, copperIngot: 100, titanium: 100,
  coolant: 100, fiberOptics: 100, solarCell: 100,
  powerCell: 100, reinforcedConcrete: 200, refinedSilver: 50, refinedGold: 50,
  // T3 - Advanced
  aiChip: 10, robotics: 5, quantumPart: 5, advancedAlloy: 10, nanoMaterial: 3,
  electronics: 50, medicalTech: 50, jewellery: 25, tungsten: 50, weapons: 50,
  scanDrone: 25, artifactDetector: 25, neuralNetwork: 25,
  carbonComposite: 25, structuralFrame: 25, fusionCell: 25, solarPanel: 50, creditChip: 25,
  // T4 - Endgame
  singularityCore: 50, darkMatterCell: 50, warpDrive: 50, antimatter: 50, chronoPart: 50,
  plasmaCore: 50, megaStructure: 50, voidCrystal: 50,
  arcologyModule: 25, habitatModule: 25, stellarEnergy: 25, luxuryGoods: 25,
  tradeContract: 25, teleporterNode: 25,
  // T5 - Transcendent
  researchMatrix: 10, worldCore: 10, shieldMatrix: 10, stellarForge: 10,
  voidEnergy: 10, marketDominance: 10, corpCapital: 10,
  dimensionalGate: 10, armadaFleet: 10,
};

function createInitialState(): GameState {
  return {
    money: 1000,
    totalMoneyEarned: 0,
    gameTick: 0,
    gameSpeed: 1,
    paused: false,
    resources: { ...initialResources },
    resourceCapacity: { ...initialCapacity },
    buildings: [],
    transportLines: [],
    powerGrid: { totalProduction: 0, totalConsumption: 0, efficiency: 1, overload: false, plants: [] },
    researchPoints: 0,
    completedResearch: [],
    activeResearch: null,
    researchProgress: 0,
    workers: [],
    market: INITIAL_MARKET.map(m => ({ ...m })),
    marketSimState: createInitialSimState(),
    sectorTrends: {},
    marketNews: [],
    marketNarratives: [],
    contracts: [],
    completedContracts: 0,
    automationUnlocks: AUTOMATION_UNLOCKS.map(a => ({ ...a })),
    prestigeState: { corporationPoints: 0, totalPrestiges: 0, megaFactoryUnlocked: false, bonuses: PRESTIGE_BONUSES.map(b => ({ ...b })) },
    activeEvents: [],
    eventLog: [],
    stats: {
      totalResourcesProduced: { ...initialResources },
      totalResourcesSold: { ...initialResources },
      peakEfficiency: 0,
      factoriesBuilt: 0,
      transportLinesBuilt: 0,
      researchCompleted: 0,
      contractsCompleted: 0,
      playTime: 0,
    },
    megaProjects: INITIAL_MEGA_PROJECTS.map(p => ({ ...p, stages: p.stages.map(s => ({ ...s })) })),
    productionHistory: [],
    blueprints: [],
    autoSellResources: [],
    storageUpgradeLevels: { ...initialResources },
    lastOnlineTimestamp: Date.now(),

    leaderboardEntries: [],
    loginStreak: {
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: '',
      totalLogins: 0,
      weeklyRewards: [],
    },
    weather: {
      current: 'clear' as const,
      intensity: 0,
      remaining: 0,
      nextChange: 100 + Math.floor(Math.random() * 200),
    },
    quests: QUEST_DEFS.map(q => ({
      ...q,
      steps: q.steps.map(s => ({ ...s })),
    })),
    payoutConfig: {
      basePayoutInterval: 100,
      lastPayoutTick: 0,
      totalPayoutsReceived: 0,
      autoCollect: true,
    },
    pendingPayout: 0,
    payoutHistory: [],
    trackedQuest: null,
    drones: {
      fleet: [{
        id: generateId(),
        status: 'idle' as const,
        missionEndTick: 0,
        missionId: null,
        speedLevel: 1,
        capacityLevel: 1,
        fuelEfficiencyLevel: 1,
      }],
      completedMissions: 0,
      totalEarned: 0,
    },
    activeTab: 'dashboard',
    selectedBuilding: null,
    notifications: [],
    productionSnapshot: emptyProductionSnapshot(),
  };
}

// --- Store Actions ---
interface GameActions {
  // Core
  gameTickAction: () => void;
  setGameSpeed: (speed: number) => void;
  togglePause: () => void;
  setActiveTab: (tab: GameTab) => void;
  
  // Buildings
  buildBuilding: (type: BuildingType) => void;
  upgradeBuilding: (id: string) => void;
  toggleBuilding: (id: string) => void;
  selectBuilding: (id: string | null) => void;
  
  // Transport
  buildTransportLine: (type: TransportType, from: string, to: string, resource: ResourceType) => void;
  upgradeTransportLine: (id: string) => void;
  toggleTransportLine: (id: string) => void;
  
  // Research
  startResearch: (id: string) => void;
  
  // Workers
  hireWorker: (type: WorkerType) => void;
  assignWorker: (workerId: string, buildingId: string | null) => void;
  levelUpWorker: (workerId: string) => void;
  
  // Market
  sellResource: (resource: ResourceType, amount: number) => void;
  buyResource: (resource: ResourceType, amount: number) => void;
  toggleAutoSell: (resource: ResourceType) => void;
  
  // Contracts
  acceptContract: (contract: Contract) => void;
  fulfillContract: (id: string) => void;
  
  // Automation
  activateAutomation: (type: string) => void;
  
  // Prestige
  doPrestige: () => void;
  purchasePrestigeBonus: (id: string) => void;
  
  // Notifications
  addNotification: (type: GameNotification['type'], message: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // Celebrations (removed)
  

  // Save/Export/Import
  exportSave: () => string;
  importSave: (saveString: string) => boolean;

  // MegaProjects
  startMegaProject: (type: MegaProjectType) => void;
  contributeToMegaProject: (type: MegaProjectType) => void;

  // Blueprints
  saveBlueprint: (name: string) => void;
  loadBlueprint: (id: string) => void;
  deleteBlueprint: (id: string) => void;
  renameBlueprint: (id: string, name: string) => void;
  exportBlueprint: (id: string) => string;
  importBlueprint: (code: string) => boolean;

  // Storage
  upgradeStorage: (resource: ResourceType, levels: number) => void;

  // Offline
  calculateOfflineProgress: () => { resources: Record<ResourceType, number>; money: number; ticksElapsed: number } | null;
  collectOfflineProgress: (offlineData: { resources: Record<ResourceType, number>; money: number; ticksElapsed: number }) => void;

  // Rank
  getCurrentRank: () => { name: string; emoji: string; color: string; score: number; nextRankScore: number | null; progress: number };

  // Game Tier
  getPlayerGameTier: () => number;

  // Leaderboard
  addLeaderboardEntry: (entry: LeaderboardEntry) => void;

  // Daily Rewards
  checkDailyLogin: () => void;
  claimDailyReward: (day: number) => void;

  // Quests
  claimQuestReward: (questId: string) => void;
  updateQuestProgress: (type: string, amount: number, targetId?: string) => void;
  setTrackedQuest: (id: string | null) => void;

  // Payouts
  collectPayout: () => void;
  toggleAutoCollect: () => void;

  // Drones
  buyDrone: () => void;
  sendDrone: (missionId: string, droneId: string) => void;
  upgradeDrone: (droneId: string, type: 'speed' | 'capacity' | 'fuelEfficiency') => void;
  generateDroneMissions: () => DroneMission[];

  // Reset
  resetGame: () => void;

  // LLM News State
  getNewsLLMState: () => import('./newsLLM').LLMEngineState;
  refreshNewsFromLLM: (updates: Array<{ id: string; title: string; description: string; affectedResources?: string[]; textSource: 'llm' }>) => void;
}

export type GameStore = GameState & GameActions;

// --- Debounced PersistStorage for Zustand v5 persist ---
// Zustand v5 persist expects a PersistStorage<S> that returns PARSED objects from
// getItem and receives parsed objects in setItem (not raw strings like the old
// Storage interface).  The previous implementation used the raw Storage API which
// caused localStorage.setItem(name, objectValue) → "[object Object]" → total data
// loss on every page refresh.
//
// This implementation wraps the raw localStorage with JSON serialization (like
// createJSONStorage) AND adds debounced writes to reduce I/O frequency.

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;

interface PendingWrite {
  name: string;
  value: string; // JSON-serialized string
}
let pendingWrite: PendingWrite | null = null;

function flushPendingWrite(): void {
  if (pendingWrite) {
    try {
      localStorage.setItem(pendingWrite.name, pendingWrite.value);
    } catch {
      // localStorage full or unavailable — non-critical
    }
    pendingWrite = null;
  }
  debounceTimer = null;
}

/**
 * Zustand v5 PersistStorage compatible wrapper with debounced writes.
 *
 * - getItem: reads from localStorage and parses JSON (same as createJSONStorage)
 * - setItem: serializes to JSON, then debounces the actual localStorage write
 * - removeItem: immediately removes from localStorage
 *
 * This fixes the critical bug where passing raw objects to the old Storage-based
 * debouncedStorage caused `localStorage.setItem(name, object)` → "[object Object]"
 * which made every page refresh lose all game state.
 */
const debouncedPersistStorage = {
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;
    try {
      const str = localStorage.getItem(name);
      if (str === null) return null;
      return JSON.parse(str);
    } catch {
      // Corrupted or unreadable data — treat as no saved state
      return null;
    }
  },
  setItem: (name: string, value: unknown) => {
    // Serialize to JSON immediately (captures current state snapshot)
    const serialized = JSON.stringify(value);
    pendingWrite = { name, value: serialized };
    if (!debounceTimer) {
      debounceTimer = setTimeout(flushPendingWrite, DEBOUNCE_MS);
    }
  },
  removeItem: (name: string) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingWrite = null;
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(name); } catch { /* noop */ }
    }
  },
};

// Force-save on page unload to prevent data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    flushPendingWrite();
  });
}

// ─── Async LLM News Enhancement ────────────────────────────────────────────
// Processes news items with EventPackets through the local LLM for text enhancement.
// Non-blocking — fires in background and updates store when results arrive.
// LLM is ONLY a language layer — it never changes data or meaning.

let llmInitialized = false;

// Register the LLM update callback once so batch results can update the store
let llmCallbackRegistered = false;

function ensureLLMCallback(): void {
  if (llmCallbackRegistered) return;
  llmCallbackRegistered = true;

  registerUpdateCallback((updates) => {
    // When LLM batch results arrive, update the corresponding news items in the store
    try {
      const store = useGameStore.getState();
      const updatedNews = store.marketNews.map(n => {
        const update = updates.find(u => u.id === n.id);
        if (update) {
          return {
            ...n,
            title: update.title,
            description: update.description,
            textSource: 'llm' as const,
          };
        }
        return n;
      });
      useGameStore.setState({ marketNews: updatedNews });
    } catch {
      // Store update failed — non-critical, keep fallback text
    }
  });
}

async function initLLMIfNeeded(): Promise<void> {
  if (!llmInitialized) {
    llmInitialized = true;
    await initNewsLLM().catch(() => { /* LLM not available — fallback mode */ });
    ensureLLMCallback();
  }
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      // --- CORE TICK ---
      gameTickAction: () => {
        const state = get();
        if (state.paused) return;

        const newTick = state.gameTick + 1;
        const newResources = { ...state.resources };
        const newStats = { ...state.stats, playTime: state.stats.playTime + 1 };
        const notifications: GameNotification[] = [];

        // Snapshot rate trackers (built during building processing, written to productionSnapshot)
        const snapshotProduction: Record<string, number> = {};
        const snapshotConsumption: Record<string, number> = {};
        const snapshotActualConsumption: Record<string, number> = {};

        // === Phase 2: Production Calculator (Single Source of Truth) ===
        const cache = buildMultipliers(state);

        // Local aliases from cache (used by non-production parts of tick)
        const weatherProductionMultiplier = cache.weatherProduction;
        const eventProductionMultiplier = cache.eventProductionGlobal;
        const eventResearchMultiplier = cache.eventResearch;
        let droneRpEarned = 0;

        // === Power Grid (via calculator) ===
        const powerResult = computePowerGrid(state, cache, newResources, newTick);
        cache.powerEfficiency = powerResult.efficiency;

        // Track fuel consumption in snapshot rate maps
        for (const fc of powerResult.fuelConsumption) {
          snapshotConsumption[fc.resource] = (snapshotConsumption[fc.resource] || 0) + fc.amount;
          snapshotActualConsumption[fc.resource] = (snapshotActualConsumption[fc.resource] || 0) + fc.actualAmount;
        }

        const totalProduction = powerResult.totalProduction;
        const totalConsumption = powerResult.totalConsumption;
        const effectivePowerEfficiency = powerResult.efficiency;
        const overload = powerResult.overload;
        const powerBuildings = state.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power' && b.active);

        if (overload && !state.powerGrid.overload) {
          soundEngine.play('powerOverload', 'events');
        }

        // Transport efficiency (for peak efficiency tracking — not production math)
        // Uses modifier engine: transportThroughputBonus includes logistics1 + advancedLogistics + cargoDrones + mega
        const transportBonus = cache.transportThroughputBonus;
        const transportEfficiency = state.transportLines.length > 0
          ? (state.transportLines.filter(t => t.active).length / Math.max(1, state.transportLines.length)) * (1 + transportBonus + cache.transportMegaBonus)
          : 1;

        // === Building Production (via calculator) ===
        const snapshotBuildings: ProductionSnapshot['buildings'] = {};

        for (const b of state.buildings) {
          if (!b.active) continue;
          const def = BUILDING_DEFS[b.type];
          if (!def) continue;
          if (def.category === 'power') continue; // Handled by power grid

          const result = computeProduction(b, cache, newResources);

          snapshotBuildings[b.id] = {
            outputs: result.outputs,
            inputs: result.inputs,
            efficiency: result.efficiency,
          };

          if (def.category === 'extractor' && result.canProduce) {
            for (const output of result.outputs) {
              const res = output.resource as ResourceType;
              const capacity = newResources[res] + output.amount;
              newResources[res] = Math.min(getCapacity(state, res, undefined, cache), capacity);
              newStats.totalResourcesProduced[res] += output.amount;
              snapshotProduction[res] = (snapshotProduction[res] || 0) + output.amount;
            }
          }

          if (def.category === 'factory') {
            // Track demand (inputs) regardless of whether factory can produce
            for (const input of result.inputs) {
              snapshotConsumption[input.resource] = (snapshotConsumption[input.resource] || 0) + input.amount;
            }

            if (result.canProduce) {
              // Consume actual inputs
              for (const input of result.actualInputs) {
                const res = input.resource as ResourceType;
                newResources[res] -= input.amount;
                snapshotActualConsumption[res] = (snapshotActualConsumption[res] || 0) + input.amount;
              }
              // Produce outputs
              for (const output of result.outputs) {
                const res = output.resource as ResourceType;
                const capacity = newResources[res] + output.amount;
                newResources[res] = Math.min(getCapacity(state, res, undefined, cache), capacity);
                newStats.totalResourcesProduced[res] += output.amount;
                snapshotProduction[res] = (snapshotProduction[res] || 0) + output.amount;
              }
            }
          }
        }

        // Worker XP bonus (research-only, NOT including mega — used by worker update below)
        const workerEfficiencyBonus = cache.workerEfficiencyResearchBonus;
        // megaMarketBonus (used by auto-sell pricing below)
        const megaMarketBonus = cache.marketBonus - (cache.hasMarketAnalysis ? 0.2 : 0) - state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'marketMultiplier').reduce((sum, b) => sum + b.effect.value, 0);

        // Update market prices using supply-demand simulator (throttled to every 5 ticks)
        let newMarket = state.market;
        let newMarketSimState = state.marketSimState;
        let newSectorTrends = state.sectorTrends;
        if (newTick % 5 === 0) {
          // Get player production/consumption rates from snapshot
          const playerProduction: Partial<Record<ResourceType, number>> = {};
          const playerConsumption: Partial<Record<ResourceType, number>> = {};
          if (state.productionSnapshot) {
            for (const [res, rate] of Object.entries(state.productionSnapshot.production)) {
              if (rate > 0) playerProduction[res as ResourceType] = rate;
            }
            for (const [res, rate] of Object.entries(state.productionSnapshot.actualConsumption)) {
              if (rate > 0) playerConsumption[res as ResourceType] = rate;
            }
          }

          const simResult = simulateMarketTick({
            market: state.market,
            production: playerProduction,
            consumption: playerConsumption,
            activeEvents: state.activeEvents,
            simState: state.marketSimState,
            gameTick: newTick,
            resources: newResources,
            resourceCapacity: state.resourceCapacity,
          });
          newMarket = simResult.market;
          newMarketSimState = simResult.simState;
          newSectorTrends = simResult.sectorTrends;

          // Append news and narratives (cap to prevent unbounded growth)
          if (simResult.news.length > 0 || simResult.narratives.length > 0) {
            const MAX_NEWS = 30;
            const MAX_NARRATIVES = 20;
            const existingNews = state.marketNews ?? [];
            const existingNarratives = state.marketNarratives ?? [];
            set({
              marketNews: [...simResult.news, ...existingNews].slice(0, MAX_NEWS),
              marketNarratives: [...simResult.narratives, ...existingNarratives].slice(0, MAX_NARRATIVES),
            });

            // ── Async LLM Enhancement ──
            // Try to enhance news text with local LLM (non-blocking)
            // Only processes news items that have eventPackets and haven't been enhanced yet
            const newsToEnhance = simResult.news.filter(n => n.eventPacket && n.textSource === 'fallback');
            if (newsToEnhance.length > 0) {
              // Update game day for budget tracking
              updateGameDay(Math.floor(newTick / 86400));
              // Initialize LLM if needed (lazy, once)
              initLLMIfNeeded();
              // Push events to batch buffer — the batch system handles timing and API calls
              for (const news of newsToEnhance) {
                if (news.eventPacket) {
                  addEventToBatch(news.eventPacket, news.id);
                }
              }
            }
          }
        }

        // Process research
        let newResearchProgress = state.researchProgress;
        let newActiveResearch = state.activeResearch;
        let newCompletedResearch = [...state.completedResearch];
        let newResearchPoints = state.researchPoints;

        if (newActiveResearch) {
          const node = RESEARCH_TREE.find(r => r.id === newActiveResearch);
          if (node) {
            const researchSpeed = cache.eventResearch * (1 + cache.researchBonus);
            newResearchProgress += researchSpeed;
            if (newResearchProgress >= node.timeRequired) {
              newCompletedResearch.push(newActiveResearch);
              newActiveResearch = null;
              newResearchProgress = 0;
              newResearchPoints += Math.floor(node.cost * getBalance().rp.completionRefundRatio);
              newStats.researchCompleted++;
              soundEngine.play('researchComplete', 'events');
              notifications.push({ id: generateId(), type: 'success', message: `Research complete: ${node.name}!`, gameTick: newTick, read: false });
            }
          }
        }

        // Currency rate trackers (income and expense separated for Currency Table)
        let moneyIncomeThisTick = 0;
        let moneyExpenseThisTick = 0;
        let rpIncomeThisTick = 0;
        let rpExpenseThisTick = 0;
        let cpIncomeThisTick = 0;
        let cpExpenseThisTick = 0;

        const bal = getBalance();
        const passiveRpIncome = bal.rp.passiveBase * (1 + state.buildings.filter(b => b.type === 'aiLab' && b.active).length * bal.rp.aiLabBonus);
        newResearchPoints += passiveRpIncome;
        rpIncomeThisTick += passiveRpIncome;

        // Add drone RP rewards
        newResearchPoints += droneRpEarned;
        rpIncomeThisTick += droneRpEarned;

        // === Building RP Generation ===
        // Buildings generate RP based on tier, scaled by power efficiency
        // This provides active RP income beyond passive generation
        const rpBuildingRates: Record<string, number> = {
          extractor: bal.rp.extractorRate,
          power: bal.rp.powerRate,
          'factory-t1': bal.rp.factoryT1Rate,
          'factory-t2': bal.rp.factoryT2Rate,
          'factory-t3': bal.rp.factoryT3Rate,
          'factory-t4': bal.rp.factoryT4Rate,
        };
        let buildingRpIncome = 0;
        state.buildings.forEach(b => {
          if (!b.active) return;
          const def = BUILDING_DEFS[b.type];
          if (!def) return;
          const tierKey = def.category === 'factory' ? `factory-t${def.tier}` : def.category;
          const rpRate = rpBuildingRates[tierKey];
          if (rpRate) {
            const income = rpRate * b.level * b.efficiency * effectivePowerEfficiency;
            newResearchPoints += income;
            buildingRpIncome += income;
          }
        });
        rpIncomeThisTick += buildingRpIncome;

        // Process contracts
        const newContracts = state.contracts.map(c => {
          if (c.completed || c.failed) return c;
          const newRemaining = c.timeRemaining - 1;
          if (newRemaining <= 0) {
            return { ...c, timeRemaining: 0, failed: true };
          }
          return { ...c, timeRemaining: newRemaining };
        });

        const autoFulfill = state.automationUnlocks.find(a => a.type === 'autoTrading' && a.active);
        if (autoFulfill) {
          newContracts.forEach(c => {
            if (c.completed || c.failed) return;
            const canFulfill = c.requiredResources.every(r => {
              if (r.resource === 'money') return true;
              return (newResources[r.resource as ResourceType] ?? 0) >= r.amount;
            });
            if (canFulfill) {
              c.requiredResources.forEach(r => {
                if (r.resource !== 'money') {
                  newResources[r.resource as ResourceType] -= r.amount;
                }
              });
              c.completed = true;
              const moneyReward = c.reward.money;
              newStats.contractsCompleted++;
              notifications.push({ id: generateId(), type: 'success', message: `Contract completed: ${c.name}! +$${formatNumber(moneyReward)}`, gameTick: newTick, read: false });
            }
          });
        }

        // Update workers
        const newWorkers = state.workers.map(w => ({
          ...w,
          experience: w.experience + bal.worker.xpPerTick * (1 + workerEfficiencyBonus),
          efficiency: Math.min(2, w.efficiency + bal.worker.efficiencyGainPerTick),
        }));

        newWorkers.forEach(w => {
          const xpNeeded = w.level * 100;
          if (w.experience >= xpNeeded) {
            w.level++;
            w.experience -= xpNeeded;
          }
        });

        // Random events (every ~500 ticks)
        const newActiveEvents = state.activeEvents.map(e => ({
          ...e,
          remaining: e.remaining - 1,
        })).filter(e => e.remaining > 0);

        if (newTick % 500 === 0 && Math.random() < bal.event.randomTriggerChance && newActiveEvents.length < 2) {
          const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
          const newEvent: GameEvent = {
            id: generateId(),
            type: template.type,
            name: template.name,
            description: template.description,
            duration: template.duration,
            remaining: template.duration,
            effects: template.effects,
            icon: template.icon,
          };
          newActiveEvents.push(newEvent);
          soundEngine.play('eventTriggered', 'events');
          notifications.push({ id: generateId(), type: 'warning', message: `Event: ${template.name} - ${template.description}`, gameTick: newTick, read: false });
        }

        // Seasonal events - random trigger each tick, limit 1 active seasonal event
        const hasActiveSeasonal = newActiveEvents.some(e => SEASONAL_EVENTS.some(se => se.id === e.type));
        if (!hasActiveSeasonal && newActiveEvents.length < 3) {
          for (const seasonal of SEASONAL_EVENTS) {
            if (Math.random() < seasonal.triggerChance) {
              const seasonalEvent: GameEvent = {
                id: generateId(),
                type: seasonal.id as GameEvent['type'],
                name: seasonal.name,
                description: seasonal.description,
                duration: seasonal.duration,
                remaining: seasonal.duration,
                effects: seasonal.effects,
                icon: seasonal.icon,
              };
              newActiveEvents.push(seasonalEvent);
              soundEngine.play('eventTriggered', 'events');
              notifications.push({ id: generateId(), type: 'warning', message: `🌟 Seasonal: ${seasonal.name} - ${seasonal.description}`, gameTick: newTick, read: false });
              break; // Only trigger one seasonal event per tick
            }
          }
        }

        // Process weather
        let newWeather = { ...state.weather };
        if (newWeather.remaining > 0) {
          newWeather.remaining = newWeather.remaining - 1;
        }
        if (newWeather.remaining <= 0 && newTick >= newWeather.nextChange) {
          const weatherTypes: WeatherType[] = ['clear', 'sunny', 'rainy', 'stormy', 'foggy', 'snowy'];
          const weights = [30, 25, 20, 10, 10, 5]; // clear is most common
          const totalWeight = weights.reduce((a, b) => a + b, 0);
          let roll = Math.random() * totalWeight;
          let selectedWeather: WeatherType = 'clear';
          for (let i = 0; i < weatherTypes.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
              selectedWeather = weatherTypes[i];
              break;
            }
          }
          newWeather = {
            current: selectedWeather,
            intensity: selectedWeather === 'clear' ? 0 : bal.weather.minIntensity + Math.random() * bal.weather.intensityRange,
            remaining: selectedWeather === 'clear' ? 0 : 100 + Math.floor(Math.random() * 300),
            nextChange: newTick + 200 + Math.floor(Math.random() * 400),
          };
          if (selectedWeather !== 'clear') {
            const wDef = WEATHER_DEFS[selectedWeather];
            notifications.push({ id: generateId(), type: 'info', message: `Weather: ${wDef.name} - ${wDef.description}`, gameTick: newTick, read: false });
          }
        }

        // Calculate player's current game tier for contract generation
        const playerGameTier = (() => {
          if (state.buildings.length === 0) return 0;
          const highestBuildingTier = Math.max(0, ...state.buildings.map(b => BUILDING_DEFS[b.type]?.tier ?? 0));
          const researchTier = Math.floor(state.completedResearch.length / 3);
          return Math.min(3, Math.max(highestBuildingTier, researchTier));
        })();

        // Generate new contracts (every ~150 ticks, tier-aware)
        let contractsToAdd: Contract[] = [];
        const activeContractCount = state.contracts.filter(c => !c.completed && !c.failed).length;
        if (newTick % 150 === 0 && activeContractCount < 4) {
          // Filter templates to only include tiers the player has access to
          const availableTemplates = CONTRACT_TEMPLATES.filter(t => (t.gameTier ?? 0) <= playerGameTier);
          // Weight towards current tier (60%) and below (40%)
          const weightedTemplates = availableTemplates.flatMap(t => {
            const tier = t.gameTier ?? 0;
            const weight = tier === playerGameTier ? 3 : tier === playerGameTier - 1 ? 2 : 1;
            return Array(weight).fill(t);
          });
          const template = weightedTemplates.length > 0
            ? weightedTemplates[Math.floor(Math.random() * weightedTemplates.length)]
            : CONTRACT_TEMPLATES[0]; // fallback to first template
          const contractTier = template.gameTier ?? 0;
          const difficulty = Math.max(1, Math.min(5, contractTier + 1 + Math.floor(state.buildings.length / 8)));
          const tierMultiplier = 1 + contractTier * bal.contract.tierRewardCoeff;
          const reward = template.requiredResources.reduce((sum, r) => {
            const marketItem = INITIAL_MARKET.find(m => m.resource === r.resource);
            return sum + (marketItem?.basePrice ?? 10) * r.amount * tierMultiplier * (1 + difficulty * bal.contract.difficultyRewardCoeff);
          }, 0);
          
          const contract: Contract = {
            id: generateId(),
            name: template.name,
            description: template.description,
            type: template.type,
            requiredResources: template.requiredResources.map(r => ({
              resource: r.resource,
              amount: Math.floor(r.amount * (1 + (difficulty - 1) * bal.contract.difficultyResourceCoeff)),
            })),
            timeLimit: template.timeLimit,
            timeRemaining: template.timeLimit,
            reward: {
              money: Math.floor(reward),
              researchPoints: Math.floor(difficulty * 15 * tierMultiplier),
              corporationPoints: contractTier >= 2 ? Math.floor((contractTier - 1) * 3 + difficulty) : 0,
            },
            progress: 0,
            completed: false,
            failed: false,
            difficulty,
            gameTier: contractTier,
            icon: template.icon,
          };
          contractsToAdd = [contract];
        }

        // Passive income from selling excess (if auto-trading is on)
        let moneyEarned = 0;
        if (autoFulfill) {
          (Object.keys(newResources) as ResourceType[]).forEach(r => {
            const excess = newResources[r] - getCapacity(state, r, undefined, cache) * bal.autoSell.thresholdRatio;
            if (excess > 0) {
              const marketPrice = newMarket.find(m => m.resource === r)?.currentPrice ?? 0;
              const sellPrice = marketPrice * computeSellMultiplier(state, cache);
              const sellAmount = Math.min(excess, 5);
              newResources[r] -= sellAmount;
              const earned = sellAmount * sellPrice;
              moneyEarned += earned;
              moneyIncomeThisTick += earned;
              newStats.totalResourcesSold[r] += sellAmount;
            }
          });
        }

        // Auto-sell specific resources when above threshold capacity
        // Sells 50% of excess per tick, clamped to [1, capacity*0.1] to prevent
        // market flooding while still draining faster than the old flat-10 cap.
        let autoSellSimState = newMarketSimState;
        if (state.autoSellResources.length > 0) {
          // Build market lookup Map for O(1) access
          const marketMap = new Map(newMarket.map(m => [m.resource, m]));
          state.autoSellResources.forEach(r => {
            const capacity = getCapacity(state, r, undefined, cache);
            const threshold = capacity * bal.autoSell.thresholdRatio;
            const held = newResources[r];
            const excess = held - threshold;
            if (excess > 0) {
              const marketItem = marketMap.get(r);
              if (marketItem) {
                const sellPrice = marketItem.currentPrice * computeSellMultiplier(state, cache);
                // Sell 50% of excess, but at least 1 and at most 10% of capacity
                const sellAmount = Math.max(1, Math.min(Math.ceil(excess * bal.autoSell.excessSellRatio), Math.ceil(capacity * bal.autoSell.maxSellCapacityRatio)));
                const actualSell = Math.min(sellAmount, held); // can't sell more than we have
                newResources[r] -= actualSell;
                const autoSellEarned = actualSell * sellPrice;
                moneyEarned += autoSellEarned;
                moneyIncomeThisTick += autoSellEarned;
                newStats.totalResourcesSold[r] += actualSell;
                // Record auto-sell in market simulator (pass gameTick for freshness tracking)
                autoSellSimState = recordPlayerSell(autoSellSimState, r, actualSell, newTick);
              }
            }
          });
          newMarketSimState = autoSellSimState;
        }

        const currentEfficiency = effectivePowerEfficiency * transportEfficiency * eventProductionMultiplier;
        const newPeakEfficiency = Math.max(state.stats.peakEfficiency, currentEfficiency);

        // Production history snapshot (every 50 ticks)
        let newHistory = state.productionHistory;
        if (newTick % 50 === 0) {
          const snapshot = {
            timestamp: Date.now(),
            resources: { ...newResources },
            money: state.money + moneyEarned,
            powerProduction: totalProduction,
            powerConsumption: totalConsumption,
          };
          newHistory = [...state.productionHistory.slice(-199), snapshot];
        }

        // Process active MegaProjects
        // Progress only advances if ALL required resources for current stage are available
        // Resources are deducted when a stage completes
        const megaProjectResourcesToDeduct: { resource: string; amount: number }[] = [];
        const newMegaProjects = state.megaProjects.map(mp => {
          if (!mp.active || mp.completed) return mp;
          const stage = mp.stages[mp.currentStage];
          if (!stage || stage.completed) return mp;

          // Check if ALL required resources are currently available
          const allResourcesAvailable = stage.requiredResources.every(r => {
            if (r.resource === 'money') return state.money >= r.amount;
            return (newResources[r.resource as ResourceType] ?? 0) >= r.amount;
          });

          // If resources are not available, progress pauses (no increment)
          if (!allResourcesAvailable) {
            return { ...mp, progress: mp.progress }; // paused
          }

          // Resources are available — increment progress
          const increment = 1 / stage.timeRequired;
          const newProgress = mp.progress + increment;

          if (newProgress >= 1) {
            // Stage complete — deduct resources now
            stage.requiredResources.forEach(r => {
              megaProjectResourcesToDeduct.push({ resource: r.resource, amount: r.amount });
            });

            const updatedStages = mp.stages.map((s, i) =>
              i === mp.currentStage ? { ...s, completed: true } : s
            );
            const nextStage = mp.currentStage + 1;
            const isCompleted = nextStage >= mp.stages.length;

            notifications.push({
              id: generateId(),
              type: isCompleted ? 'success' : 'info',
              message: isCompleted
                ? `🏆 MEGA PROJECT COMPLETE: ${mp.name}! ${mp.bonus.description}`
                : `⚡ ${mp.name} - Stage ${nextStage}/${mp.stages.length}: ${mp.stages[mp.currentStage]?.name} complete!`,
              gameTick: newTick,
              read: false,
            });

            soundEngine.play('levelUp', 'events');

            return {
              ...mp,
              stages: updatedStages,
              currentStage: nextStage,
              progress: 0,
              completed: isCompleted,
              active: !isCompleted,
            };
          }

          return { ...mp, progress: newProgress };
        });

        // Deduct resources for completed mega project stages
        let megaDeductMoney = 0;
        megaProjectResourcesToDeduct.forEach(r => {
          if (r.resource === 'money') {
            megaDeductMoney += r.amount;
          } else {
            newResources[r.resource as ResourceType] = Math.max(0, (newResources[r.resource as ResourceType] ?? 0) - r.amount);
          }
        });
        if (megaDeductMoney > 0) {
          moneyEarned -= megaDeductMoney;
          moneyExpenseThisTick += megaDeductMoney;
        }

        // --- Milestone detection ---
        // Power milestones
        const POWER_MILESTONES = [100, 500, 1000];
        POWER_MILESTONES.forEach(milestone => {
          if (totalProduction >= milestone && state.powerGrid.totalProduction < milestone) {
            soundEngine.play('levelUp', 'events');
          }
        });

        // --- Payout System ---
        let newPayoutConfig = { ...state.payoutConfig };
        let newPendingPayout = state.pendingPayout;
        let newPayoutHistory = state.payoutHistory;
        let payoutMoneyEarned = 0;

        const ticksSinceLastPayout = newTick - newPayoutConfig.lastPayoutTick;
        if (ticksSinceLastPayout >= newPayoutConfig.basePayoutInterval && state.buildings.length > 0) {
          // Calculate payout via calculator (single source of truth)
          const payoutResult = computePayout(state, cache);
          const payoutAmount = payoutResult.amountPerCycle;

          // avgEfficiency for payout history record
          const activeBuildings = state.buildings.filter(b => b.active);
          const avgEfficiency = activeBuildings.length > 0
            ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length
            : 0;

          if (payoutAmount > 0) {
            if (newPayoutConfig.autoCollect) {
              // Auto-collect: add to money directly
              payoutMoneyEarned = payoutAmount;
              notifications.push({
                id: generateId(),
                type: 'success',
                message: `💰 Payout received: $${formatNumber(payoutAmount)}`,
                gameTick: newTick,
                read: false,
              });
            } else {
              // Manual collect: accumulate in pending
              newPendingPayout += payoutAmount;
              notifications.push({
                id: generateId(),
                type: 'info',
                message: `💰 Payout ready: $${formatNumber(payoutAmount)} — Click to collect!`,
                gameTick: newTick,
                read: false,
              });
            }

            // Record payout history
            const record: PayoutRecord = {
              tick: newTick,
              amount: payoutAmount,
              buildingCount: activeBuildings.length,
              efficiency: avgEfficiency,
            };
            newPayoutHistory = [...state.payoutHistory.slice(-9), record];

            // Update payout config
            newPayoutConfig = {
              ...newPayoutConfig,
              lastPayoutTick: newTick,
              totalPayoutsReceived: newPayoutConfig.totalPayoutsReceived + 1,
            };

            soundEngine.play('moneyEarned', 'building');

            // --- Payout Milestone Celebrations ---
            const PAYOUT_MILESTONES = [1, 10, 25, 50, 100];
            const newTotalPayouts = newPayoutConfig.totalPayoutsReceived;
            PAYOUT_MILESTONES.forEach(milestone => {
              if (newTotalPayouts === milestone) {
                soundEngine.play('levelUp', 'events');
              }
            });
          }
        }

        moneyEarned += payoutMoneyEarned;
        moneyIncomeThisTick += payoutMoneyEarned;

        // --- Process Drone Deliveries ---
        let droneMoneyEarned = 0;
        droneRpEarned = 0;
        const droneResourceRewards: Partial<Record<ResourceType, number>> = {};
        let newDrones = state.drones;

        const deliveringDrones = state.drones.fleet.filter(d => d.status === 'delivering' && d.missionEndTick <= newTick);
        if (deliveringDrones.length > 0) {
          const missions = generateDroneMissionsFromState(state);
          const updatedFleet = state.drones.fleet.map(d => {
            if (d.status !== 'delivering' || d.missionEndTick > newTick) return d;
            // Mission complete
            const mission = missions.find(m => m.id === d.missionId);
            if (mission) {
              const capacityMult = 1 + (d.capacityLevel - 1) * bal.drone.capacityUpgradeCoeff;
              droneMoneyEarned += Math.floor(mission.reward.money * capacityMult);
              if (mission.reward.researchPoints) droneRpEarned += Math.floor(mission.reward.researchPoints * capacityMult);
              if (mission.reward.resources) {
                mission.reward.resources.forEach(r => {
                  droneResourceRewards[r.resource] = (droneResourceRewards[r.resource] || 0) + Math.floor(r.amount * capacityMult);
                });
              }
            }
            return { ...d, status: 'idle' as const, missionEndTick: 0, missionId: null };
          });
          newDrones = {
            fleet: updatedFleet,
            completedMissions: state.drones.completedMissions + deliveringDrones.length,
            totalEarned: state.drones.totalEarned + droneMoneyEarned,
          };

          // Add resources from drone deliveries
          (Object.keys(droneResourceRewards) as ResourceType[]).forEach(r => {
            const amount = droneResourceRewards[r] || 0;
            newResources[r] = Math.min(getCapacity(state, r), newResources[r] + amount);
          });

          moneyEarned += droneMoneyEarned;
          moneyIncomeThisTick += droneMoneyEarned;
          if (droneMoneyEarned > 0) {
            soundEngine.play('moneyEarned', 'building');
            notifications.push({
              id: generateId(),
              type: 'success',
              message: `🚁 Drone delivery complete! +$${formatNumber(droneMoneyEarned)}${droneRpEarned > 0 ? ` +${droneRpEarned} RP` : ''}`,
              gameTick: newTick,
              read: false,
            });
          }
        }

        // === Endgame Building Passive Income (via calculator) ===
        let corpGained = 0;
        const endgameResult = computeEndgameIncome(state, cache);
        moneyEarned += endgameResult.moneyPerTick;
        moneyIncomeThisTick += endgameResult.moneyPerTick;
        newResearchPoints += endgameResult.researchPerTick;
        rpIncomeThisTick += endgameResult.researchPerTick;
        corpGained += endgameResult.corpPerTick;
        cpIncomeThisTick += endgameResult.corpPerTick;

        // Rank change detection
        const prevScore = Math.floor(
          state.totalMoneyEarned +
          state.buildings.length * 100 +
          state.completedResearch.length * 200 +
          state.stats.contractsCompleted * 50 +
          state.prestigeState.totalPrestiges * 500
        );
        const newTotalMoneyEarned = state.totalMoneyEarned + moneyEarned;
        const newScore = Math.floor(
          newTotalMoneyEarned +
          state.buildings.length * 100 +
          newCompletedResearch.length * 200 +
          newStats.contractsCompleted * 50 +
          state.prestigeState.totalPrestiges * 500
        );
        let prevRankName = RANK_THRESHOLDS[0].name;
        let newRankName = RANK_THRESHOLDS[0].name;
        for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
          if (prevScore >= RANK_THRESHOLDS[i].minScore) { prevRankName = RANK_THRESHOLDS[i].name; break; }
        }
        for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
          if (newScore >= RANK_THRESHOLDS[i].minScore) { newRankName = RANK_THRESHOLDS[i].name; break; }
        }
        if (newRankName !== prevRankName) {
          soundEngine.play('levelUp', 'events');
        }

        // === Assemble ProductionSnapshot ===
        const payoutSnapshot = computePayout(state, cache);
        const productionSnapshot: ProductionSnapshot = {
          production: { ...snapshotProduction },
          consumption: { ...snapshotConsumption },
          actualConsumption: { ...snapshotActualConsumption },
          buildings: snapshotBuildings,
          powerProduction: powerResult.totalProduction,
          powerConsumption: powerResult.totalConsumption,
          powerEfficiency: powerResult.efficiency,
          powerOverload: powerResult.overload,
          payoutPerCycle: payoutSnapshot.amountPerCycle,
          payoutBreakdown: payoutSnapshot.breakdown,
          sellMultiplier: computeSellMultiplier(state, cache),
          endgameMoney: endgameResult.moneyPerTick,
          endgameResearch: endgameResult.researchPerTick,
          endgameCorp: endgameResult.corpPerTick,
          moneyIncomeRate: moneyIncomeThisTick,
          moneyExpenseRate: moneyExpenseThisTick,
          rpIncomeRate: rpIncomeThisTick,
          rpExpenseRate: rpExpenseThisTick,
          cpIncomeRate: cpIncomeThisTick,
          cpExpenseRate: cpExpenseThisTick,
        };

        set({
          gameTick: newTick,
          resources: newResources,
          money: state.money + moneyEarned,
          totalMoneyEarned: state.totalMoneyEarned + moneyEarned,
          powerGrid: {
            totalProduction,
            totalConsumption,
            efficiency: effectivePowerEfficiency,
            overload,
            plants: powerBuildings,
          },
          market: newMarket,
          marketSimState: newMarketSimState,
          sectorTrends: newSectorTrends,
          researchPoints: newResearchPoints,
          completedResearch: newCompletedResearch,
          activeResearch: newActiveResearch,
          researchProgress: newResearchProgress,
          workers: newWorkers,
          contracts: [...newContracts, ...contractsToAdd],
          activeEvents: newActiveEvents,
          stats: { ...newStats, peakEfficiency: newPeakEfficiency },
          megaProjects: newMegaProjects,
          productionHistory: newHistory,
          notifications: [...notifications, ...state.notifications.slice(-20)],
          lastOnlineTimestamp: Date.now(),
          weather: newWeather,
          payoutConfig: newPayoutConfig,
          pendingPayout: newPendingPayout,
          payoutHistory: newPayoutHistory,
          drones: newDrones,
          prestigeState: corpGained > 0 ? {
            ...state.prestigeState,
            corporationPoints: state.prestigeState.corporationPoints + corpGained,
          } : state.prestigeState,
          productionSnapshot,
        });

        // --- Update Quest Progress (periodic checks) ---
        // Check every 10 ticks to avoid performance overhead
        if (newTick % 10 === 0) {
          // Update 'reach' type quests (e.g., power efficiency)
          get().updateQuestProgress('reach', 0);
          // Update 'earn' type quests with current totalMoneyEarned
          get().updateQuestProgress('earn', 0);
          // Update 'produce' type quests based on totalResourcesProduced
          const producedStats = newStats.totalResourcesProduced;
          const quests = get().quests;
          quests.forEach(q => {
            if (q.type === 'produce' && !q.claimed && !q.completed && q.targetResource) {
              const totalProduced = producedStats[q.targetResource] ?? 0;
              // Only update if the quest progress is behind actual production
              const maxStepCurrent = Math.max(...q.steps.map(s => s.current));
              if (totalProduced > maxStepCurrent) {
                get().updateQuestProgress('produce', totalProduced - maxStepCurrent, q.targetResource);
              }
            }
          });
        }
      },

      // C4 FIX: Validate game speed against allowed values before setting.
      // Without this, a player could set speed to 1000 via console, causing
      // 1000 ticks/second, browser crash, and data corruption.
      setGameSpeed: (speed: number) => {
        const ALLOWED_SPEEDS = [1, 2, 5, 10] as const;
        if (!ALLOWED_SPEEDS.includes(speed as typeof ALLOWED_SPEEDS[number])) {
          console.warn(`[Security] Invalid game speed ${speed} rejected. Allowed: ${ALLOWED_SPEEDS.join(', ')}`);
          return; // Reject invalid speed — do not update state
        }
        set({ gameSpeed: speed });
      },
      togglePause: () => set(state => ({ paused: !state.paused })),
      setActiveTab: (tab: GameTab) => set({ activeTab: tab }),

      // --- BUILDING ACTIONS ---
      buildBuilding: (type: BuildingType) => {
        const state = get();
        const def = BUILDING_DEFS[type];
        if (!def) return;

        if (!isBuildingUnlocked(type, state.completedResearch, state.prestigeState)) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `${def.name} is locked! Complete required research first.`);
          return;
        }

        const currentCount = state.buildings.filter(b => b.type === type).length;
        const megaBuildingCostReduction = getMegaProjectBonus(state.megaProjects, 'buildingCostReduction');
        const cost = getBuildingCost(type, currentCount, megaBuildingCostReduction);

        if (state.money < cost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `Not enough money! Need $${formatNumber(cost)}`);
          return;
        }

        const building: BuildingInstance = {
          id: generateId(),
          type,
          level: 1,
          active: true,
          efficiency: 1,
          placedAt: state.gameTick,
        };

        // First building
        if (state.buildings.length === 0) {
          soundEngine.play('levelUp', 'events');
        }

        set({
          money: state.money - cost,
          buildings: [...state.buildings, building],
          stats: { ...state.stats, factoriesBuilt: state.stats.factoriesBuilt + 1 },
        });
        soundEngine.play('buildingPlaced', 'building');
        get().addNotification('success', `Built ${def.name} for $${formatNumber(cost)}`);
        get().updateQuestProgress('build', 1, type);
      },

      upgradeBuilding: (id: string) => {
        const state = get();
        const building = state.buildings.find(b => b.id === id);
        if (!building) return;

        const def = BUILDING_DEFS[building.type];
        const megaBuildingCostReduction2 = getMegaProjectBonus(state.megaProjects, 'buildingCostReduction');
        const cost = getBuildingCost(building.type, building.level, megaBuildingCostReduction2);

        if (state.money < cost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `Not enough money! Need $${formatNumber(cost)} to upgrade`);
          return;
        }

        set({
          money: state.money - cost,
          buildings: state.buildings.map(b =>
            b.id === id ? { ...b, level: b.level + 1, efficiency: Math.min(2, b.efficiency + getBalance().building.upgradeEfficiencyGain) } : b
          ),
        });
        soundEngine.play('buildingPlaced', 'building');
        get().addNotification('info', `Upgraded ${def.name} to level ${building.level + 1}`);
      },

      toggleBuilding: (id: string) => {
        const state = get();
        const building = state.buildings.find(b => b.id === id);
        if (!building) return;
        const def = BUILDING_DEFS[building.type];
        const newActive = !building.active;
        const newBuildings = state.buildings.map(b =>
          b.id === id ? { ...b, active: newActive } : b
        );

        // Recalculate power grid immediately so UI updates without waiting for next tick
        // Uses productionCalculator's computePowerGrid for consistency with gameTick
        const tempState = { ...state, buildings: newBuildings };
        const cache = buildMultipliers(tempState);
        const tempResources = { ...state.resources };
        const powerResult = computePowerGrid(tempState, cache, tempResources, state.gameTick);

        // Play sound for power toggle
        if (def?.category === 'power') {
          soundEngine.play(newActive ? 'buildPlace' : 'powerOverload', 'events');
        }

        set({
          buildings: newBuildings,
          powerGrid: {
            totalProduction: powerResult.totalProduction,
            totalConsumption: powerResult.totalConsumption,
            efficiency: powerResult.efficiency,
            overload: powerResult.overload,
            plants: newBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power' && b.active),
          },
        });
      },

      selectBuilding: (id: string | null) => set({ selectedBuilding: id }),

      // --- TRANSPORT ACTIONS ---
      buildTransportLine: (type: TransportType, from: string, to: string, resource: ResourceType) => {
        const state = get();
        const def = TRANSPORT_DEFS[type];
        if (!def) return;

        const cost = def.baseCost.reduce((sum, c) => sum + (c.resource === 'money' ? c.amount : 0), 0);
        if (state.money < cost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `Not enough money! Need $${formatNumber(cost)}`);
          return;
        }

        // Use modifier engine for transport bonus (logistics1 + advancedLogistics + cargoDrones + mega)
        const cache = buildMultipliers(state);
        const transportBonus = cache.transportThroughputBonus;

        const line: TransportLine = {
          id: generateId(),
          type,
          level: 1,
          fromBuilding: from,
          toBuilding: to,
          carriesResource: resource,
          throughput: def.baseThroughput * (1 + transportBonus),
          maxThroughput: def.baseThroughput * 3,
          active: true,
        };

        set({
          money: state.money - cost,
          transportLines: [...state.transportLines, line],
          stats: { ...state.stats, transportLinesBuilt: state.stats.transportLinesBuilt + 1 },
        });
        soundEngine.play('buildingPlaced', 'building');
        get().addNotification('success', `Built ${def.name} for $${formatNumber(cost)}`);
        get().updateQuestProgress('transport', 1);
      },

      upgradeTransportLine: (id: string) => {
        const state = get();
        const line = state.transportLines.find(l => l.id === id);
        if (!line) return;

        const def = TRANSPORT_DEFS[line.type];
        const cost = Math.floor(def.baseCost.reduce((sum, c) => sum + (c.resource === 'money' ? c.amount : 0), 0) * Math.pow(getBalance().transport.upgradeCostExponent, line.level));
        if (state.money < cost) return;

        // Use modifier engine for transport bonus (logistics1 + advancedLogistics + cargoDrones + mega)
        const cache = buildMultipliers(state);
        const transportBonus = cache.transportThroughputBonus;

        set({
          money: state.money - cost,
          transportLines: state.transportLines.map(l =>
            l.id === id ? {
              ...l,
              level: l.level + 1,
              throughput: Math.min(l.maxThroughput, def.baseThroughput * Math.pow(def.upgradeMultiplier, l.level) * (1 + transportBonus)),
            } : l
          ),
        });
      },

      toggleTransportLine: (id: string) => {
        const state = get();
        set({
          transportLines: state.transportLines.map(l =>
            l.id === id ? { ...l, active: !l.active } : l
          ),
        });
      },

      // --- RESEARCH ACTIONS ---
      startResearch: (id: string) => {
        const state = get();
        if (state.activeResearch) {
          get().addNotification('warning', 'Research already in progress!');
          return;
        }

        const node = RESEARCH_TREE.find(r => r.id === id);
        if (!node) return;

        if (state.completedResearch.includes(id)) {
          get().addNotification('warning', 'Already researched!');
          return;
        }

        if (!isResearchUnlocked(id, state.completedResearch)) {
          get().addNotification('error', 'Prerequisites not met!');
          return;
        }

        if (state.researchPoints < node.cost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `Need ${formatNumber(node.cost)} RP! Have ${formatNumber(state.researchPoints)}`);
          return;
        }

        set({
          researchPoints: state.researchPoints - node.cost,
          activeResearch: id,
          researchProgress: 0,
        });
        soundEngine.play('buttonClick', 'ui');
        get().addNotification('info', `Started research: ${node.name}`);
        get().updateQuestProgress('research', 1);
      },

      // --- WORKER ACTIONS ---
      hireWorker: (type: WorkerType) => {
        const state = get();
        const def = WORKER_DEFS[type];
        if (!def) return;

        if (state.money < def.baseHireCost) {
          get().addNotification('error', `Not enough money! Need $${formatNumber(def.baseHireCost)}`);
          return;
        }

        const worker: Worker = {
          id: generateId(),
          type,
          level: 1,
          experience: 0,
          assignedTo: null,
          efficiency: 1,
          speed: 1,
          maintenance: 0,
        };

        set({
          money: state.money - def.baseHireCost,
          workers: [...state.workers, worker],
        });
        get().addNotification('success', `Hired ${def.name}`);
        get().updateQuestProgress('worker', 1);
      },

      assignWorker: (workerId: string, buildingId: string | null) => {
        const state = get();
        set({
          workers: state.workers.map(w =>
            w.id === workerId ? { ...w, assignedTo: buildingId } : w
          ),
        });
      },

      levelUpWorker: (_workerId: string) => {
        // Workers level up automatically based on experience
      },

      // --- MARKET ACTIONS ---
      sellResource: (resource: ResourceType, amount: number) => {
        const state = get();
        if (state.resources[resource] < amount) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', 'Not enough resources!');
          return;
        }

        const marketItem = state.market.find(m => m.resource === resource);
        if (!marketItem) return;

        const sellPrice = marketItem.currentPrice * amount * computeSellMultiplier(state, buildMultipliers(state));

        // Record player sell in market simulator (affects future prices + freshness tracking)
        const newSimState = recordPlayerSell(state.marketSimState, resource, amount, state.gameTick);

        set({
          resources: { ...state.resources, [resource]: state.resources[resource] - amount },
          money: state.money + sellPrice,
          totalMoneyEarned: state.totalMoneyEarned + sellPrice,
          stats: { ...state.stats, totalResourcesSold: { ...state.stats.totalResourcesSold, [resource]: state.stats.totalResourcesSold[resource] + amount } },
          marketSimState: newSimState,
        });
        soundEngine.play('moneyEarned', 'production');
        get().addNotification('success', `Sold ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(sellPrice)}`);
        get().updateQuestProgress('sell', 1);
      },

      buyResource: (resource: ResourceType, amount: number) => {
        const state = get();
        const marketItem = state.market.find(m => m.resource === resource);
        if (!marketItem) return;

        const cost = marketItem.currentPrice * amount * getBalance().market.buyPriceMarkup;
        if (state.money < cost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', 'Not enough money!');
          return;
        }

        const newAmount = state.resources[resource] + amount;
        if (newAmount > getCapacity(state, resource)) {
          soundEngine.play('error', 'ui');
          get().addNotification('warning', 'Storage full!');
          return;
        }

        // Record player buy in market simulator (affects future prices + freshness tracking)
        const newSimState = recordPlayerBuy(state.marketSimState, resource, amount, state.gameTick);

        set({
          resources: { ...state.resources, [resource]: newAmount },
          money: state.money - cost,
          marketSimState: newSimState,
        });
        get().addNotification('info', `Bought ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(cost)}`);
      },

      toggleAutoSell: (resource: ResourceType) => {
        const state = get();
        const current = state.autoSellResources;
        if (current.includes(resource)) {
          set({ autoSellResources: current.filter(r => r !== resource) });
        } else {
          set({ autoSellResources: [...current, resource] });
        }
      },

      // --- CONTRACT ACTIONS ---
      acceptContract: (contract: Contract) => {
        const state = get();
        if (state.contracts.filter(c => !c.completed && !c.failed).length >= 5) {
          get().addNotification('warning', 'Too many active contracts!');
          return;
        }
        set({ contracts: [...state.contracts, contract] });
        get().addNotification('info', `Accepted contract: ${contract.name}`);
      },

      fulfillContract: (id: string) => {
        const state = get();
        const contract = state.contracts.find(c => c.id === id);
        if (!contract || contract.completed || contract.failed) return;

        const canFulfill = contract.requiredResources.every(r => {
          if (r.resource === 'money') return true;
          return (state.resources[r.resource as ResourceType] ?? 0) >= r.amount;
        });
        if (!canFulfill) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', 'Not enough resources to fulfill contract!');
          return;
        }

        const newResources = { ...state.resources };
        contract.requiredResources.forEach(r => {
          if (r.resource !== 'money') {
            newResources[r.resource as ResourceType] -= r.amount;
          }
        });

        set({
          resources: newResources,
          money: state.money + contract.reward.money,
          totalMoneyEarned: state.totalMoneyEarned + contract.reward.money,
          researchPoints: state.researchPoints + (contract.reward.researchPoints ?? 0),
          prestigeState: {
            ...state.prestigeState,
            corporationPoints: state.prestigeState.corporationPoints + (contract.reward.corporationPoints ?? 0),
          },
          contracts: state.contracts.map(c =>
            c.id === id ? { ...c, completed: true, progress: 1 } : c
          ),
          completedContracts: state.completedContracts + 1,
          stats: { ...state.stats, contractsCompleted: state.stats.contractsCompleted + 1 },
        });
        soundEngine.play('contractCompleted', 'events');
        get().addNotification('success', `Contract fulfilled: ${contract.name}! +$${formatNumber(contract.reward.money)}`);
        get().updateQuestProgress('contract', 1);
      },

      // --- AUTOMATION ACTIONS ---
      activateAutomation: (type: string) => {
        const state = get();
        const unlock = state.automationUnlocks.find(a => a.type === type);
        if (!unlock || unlock.active) return;

        if (unlock.requiresResearch && !state.completedResearch.includes(unlock.requiresResearch)) {
          get().addNotification('error', `Requires research: ${RESEARCH_TREE.find(r => r.id === unlock.requiresResearch)?.name}`);
          return;
        }

        if (state.prestigeState.corporationPoints < unlock.cost) {
          get().addNotification('error', `Need ${unlock.cost} Corporation Points!`);
          return;
        }

        set({
          prestigeState: {
            ...state.prestigeState,
            corporationPoints: state.prestigeState.corporationPoints - unlock.cost,
          },
          automationUnlocks: state.automationUnlocks.map(a =>
            a.type === type ? { ...a, active: true } : a
          ),
        });
        soundEngine.play('levelUp', 'events');
        get().addNotification('success', `Activated: ${unlock.name}!`);
      },

      // --- PRESTIGE ACTIONS ---
      doPrestige: () => {
        const state = get();
        if (state.buildings.length < 5) {
          get().addNotification('error', 'Need at least 5 buildings to Global Expand!');
          return;
        }

        const pointsEarned = Math.floor(state.buildings.length * getBalance().prestige.cpPerBuilding + state.completedResearch.length * 2 + state.stats.contractsCompleted);

        // Calculate score and rank for leaderboard entry
        const score = Math.floor(
          state.totalMoneyEarned +
          state.buildings.length * 100 +
          state.completedResearch.length * 200 +
          state.stats.contractsCompleted * 50 +
          state.prestigeState.totalPrestiges * 500
        );
        const rankThreshold = [...RANK_THRESHOLDS].reverse().find(r => score >= r.minScore);
        const rankName = rankThreshold?.name ?? 'Apprentice';

        // Generate corporation name
        const prefixes = ['Factory', 'Industrial', 'Global', 'Prime', 'Alpha', 'Omega', 'Nexus', 'Apex', 'Titan', 'Vanguard'];
        const suffixes = ['Corp', 'Industries', 'Holdings', 'Systems', 'Dynamics', 'Syndicate', 'Group', 'Enterprises', 'Ventures', 'Network'];
        const corporationName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;

        // Create leaderboard entry before resetting
        const entry: LeaderboardEntry = {
          id: generateId(),
          rank: 0, // Will be re-calculated when viewing
          score,
          corporationName,
          buildingsBuilt: state.stats.factoriesBuilt,
          researchCompleted: state.completedResearch.length,
          contractsCompleted: state.stats.contractsCompleted,
          totalMoneyEarned: state.totalMoneyEarned,
          playTime: state.stats.playTime,
          prestigeCount: state.prestigeState.totalPrestiges + 1,
          achievedAt: state.gameTick,
          rankName,
        };

        const existingEntries = state.leaderboardEntries;
        // Sort and assign ranks
        const updatedEntries = [...existingEntries, entry]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((e, i) => ({ ...e, rank: i + 1 }));

        set({
          ...createInitialState(),
          prestigeState: {
            corporationPoints: state.prestigeState.corporationPoints + pointsEarned,
            totalPrestiges: state.prestigeState.totalPrestiges + 1,
            megaFactoryUnlocked: state.prestigeState.megaFactoryUnlocked,
            bonuses: state.prestigeState.bonuses,
          },
          leaderboardEntries: updatedEntries,
        });

        soundEngine.play('levelUp', 'events');
        get().updateQuestProgress('prestige', 1);
      },

      purchasePrestigeBonus: (id: string) => {
        const state = get();
        const bonus = state.prestigeState.bonuses.find(b => b.id === id);
        if (!bonus || bonus.purchased) return;

        if (state.prestigeState.corporationPoints < bonus.cost) {
          get().addNotification('error', `Need ${bonus.cost} Corporation Points!`);
          return;
        }

        set({
          prestigeState: {
            ...state.prestigeState,
            corporationPoints: state.prestigeState.corporationPoints - bonus.cost,
            bonuses: state.prestigeState.bonuses.map(b =>
              b.id === id ? { ...b, purchased: true } : b
            ),
          },
        });
        soundEngine.play('levelUp', 'events');
        get().addNotification('success', `Purchased: ${bonus.name}!`);
      },

      // --- NOTIFICATION ACTIONS ---
      addNotification: (type: GameNotification['type'], message: string) => {
        const state = get();
        set({
          notifications: [{ id: generateId(), type, message, gameTick: state.gameTick, read: false }, ...state.notifications].slice(0, 30),
        });
      },

      clearNotifications: () => set({ notifications: [] }),

      markNotificationRead: (id: string) => {
        set(state => ({
          notifications: state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      markAllNotificationsRead: () => {
        set(state => ({
          notifications: state.notifications.map(n => ({ ...n, read: true })),
        }));
      },



      exportSave: () => {
        const state = get();
        const saveData = {
          money: state.money,
          totalMoneyEarned: state.totalMoneyEarned,
          gameTick: state.gameTick,
          resources: state.resources,
          resourceCapacity: state.resourceCapacity,
          buildings: state.buildings,
          transportLines: state.transportLines,
          researchPoints: state.researchPoints,
          completedResearch: state.completedResearch,
          workers: state.workers,
          contracts: state.contracts,
          completedContracts: state.completedContracts,
          automationUnlocks: state.automationUnlocks,
          prestigeState: state.prestigeState,
          stats: state.stats,
          storageUpgradeLevels: state.storageUpgradeLevels,
          lastOnlineTimestamp: state.lastOnlineTimestamp,
          _version: SAVE_VERSION,
          leaderboardEntries: state.leaderboardEntries,
          loginStreak: state.loginStreak,
          weather: state.weather,
          quests: state.quests,
          payoutConfig: state.payoutConfig,
          pendingPayout: state.pendingPayout,
          payoutHistory: state.payoutHistory,
          drones: state.drones,
          _exportedAt: Date.now(),
        };
        try {
          const json = JSON.stringify(saveData);
          return btoa(encodeURIComponent(json));
        } catch {
          return '';
        }
      },

      // C3 FIX: importSave now has strict bounds validation.
      // Previously, a crafted save could inject money: Infinity, arbitrary keys
      // in resources, or corrupted buildings. Now all values are validated.
      importSave: (saveString: string) => {
        try {
          const json = decodeURIComponent(atob(saveString));
          const data = JSON.parse(json);

          // ── Validate structure has key fields ──
          if (
            typeof data.money !== 'number' ||
            typeof data.gameTick !== 'number' ||
            typeof data.resources !== 'object' ||
            !Array.isArray(data.buildings)
          ) {
            return false;
          }

          // ── Validate monetary bounds ──
          const MAX_MONEY = 1e15;
          const MAX_RESOURCE = 1e12;
          const MAX_RESEARCH_POINTS = 1e9;
          const MAX_BUILDING_LEVEL = 100;
          const MAX_BUILDINGS_COUNT = 500;
          const MAX_GAME_TICK = 1e9;

          // Reject if money is out of bounds
          if (!Number.isFinite(data.money) || data.money < 0 || data.money > MAX_MONEY) {
            console.warn(`[Security] Save import rejected: money=${data.money} out of bounds [0, ${MAX_MONEY}]`);
            return false;
          }
          if (typeof data.totalMoneyEarned === 'number' && (!Number.isFinite(data.totalMoneyEarned) || data.totalMoneyEarned < 0 || data.totalMoneyEarned > MAX_MONEY)) {
            console.warn(`[Security] Save import rejected: totalMoneyEarned out of bounds`);
            return false;
          }
          if (typeof data.gameTick === 'number' && (!Number.isFinite(data.gameTick) || data.gameTick < 0 || data.gameTick > MAX_GAME_TICK)) {
            console.warn(`[Security] Save import rejected: gameTick out of bounds`);
            return false;
          }
          if (typeof data.researchPoints === 'number' && (!Number.isFinite(data.researchPoints) || data.researchPoints < 0 || data.researchPoints > MAX_RESEARCH_POINTS)) {
            console.warn(`[Security] Save import rejected: researchPoints out of bounds`);
            return false;
          }

          // ── Validate resources: only known resource keys, finite values, within bounds ──
          const validResourceKeys = new Set(Object.keys(initialResources));
          const sanitizedResources: Record<string, number> = {};
          if (data.resources && typeof data.resources === 'object') {
            for (const [key, value] of Object.entries(data.resources as Record<string, unknown>)) {
              if (!validResourceKeys.has(key)) {
                console.warn(`[Security] Save import: rejecting unknown resource key "${key}"`);
                continue; // Skip unknown keys instead of accepting them
              }
              if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_RESOURCE) {
                console.warn(`[Security] Save import: rejecting resource "${key}" with invalid value ${value}`);
                continue; // Skip invalid values
              }
              sanitizedResources[key] = value;
            }
          }

          // ── Validate buildings: check types exist in BUILDING_DEFS, levels in bounds ──
          let sanitizedBuildings = data.buildings;
          if (Array.isArray(data.buildings)) {
            if (data.buildings.length > MAX_BUILDINGS_COUNT) {
              console.warn(`[Security] Save import rejected: too many buildings (${data.buildings.length})`);
              return false;
            }
            for (const b of data.buildings) {
              if (!b || typeof b !== 'object') {
                console.warn('[Security] Save import rejected: invalid building entry');
                return false;
              }
              const building = b as Record<string, unknown>;
              // Building type must exist in definitions
              if (typeof building.type === 'string' && !BUILDING_DEFS[building.type as BuildingType]) {
                console.warn(`[Security] Save import: unknown building type "${building.type}" — keeping but flagging`);
                // We allow unknown types for forward-compatibility but log them
              }
              // Level must be in bounds
              if (typeof building.level === 'number') {
                if (!Number.isFinite(building.level) || building.level < 1 || building.level > MAX_BUILDING_LEVEL) {
                  console.warn(`[Security] Save import rejected: building level ${building.level} out of bounds`);
                  return false;
                }
              }
            }
          }

          // ── Validate completedResearch: must be an array of strings ──
          if (Array.isArray(data.completedResearch)) {
            for (const r of data.completedResearch) {
              if (typeof r !== 'string') {
                console.warn('[Security] Save import rejected: non-string in completedResearch');
                return false;
              }
            }
          }

          const state = get();
          set({
            money: data.money, // Already validated above
            totalMoneyEarned: typeof data.totalMoneyEarned === 'number' ? Math.min(data.totalMoneyEarned, MAX_MONEY) : state.totalMoneyEarned,
            gameTick: typeof data.gameTick === 'number' ? Math.min(data.gameTick, MAX_GAME_TICK) : state.gameTick,
            resources: Object.keys(sanitizedResources).length > 0 ? { ...state.resources, ...sanitizedResources } : state.resources,
            resourceCapacity: data.resourceCapacity && typeof data.resourceCapacity === 'object' ? { ...state.resourceCapacity, ...data.resourceCapacity } : state.resourceCapacity,
            buildings: Array.isArray(sanitizedBuildings) ? sanitizedBuildings : state.buildings,
            transportLines: Array.isArray(data.transportLines) ? data.transportLines : state.transportLines,
            researchPoints: typeof data.researchPoints === 'number' ? Math.min(data.researchPoints, MAX_RESEARCH_POINTS) : state.researchPoints,
            completedResearch: Array.isArray(data.completedResearch) ? data.completedResearch : state.completedResearch,
            workers: Array.isArray(data.workers) ? data.workers : state.workers,
            contracts: Array.isArray(data.contracts) ? data.contracts : state.contracts,
            completedContracts: typeof data.completedContracts === 'number' ? data.completedContracts : state.completedContracts,
            automationUnlocks: Array.isArray(data.automationUnlocks) ? data.automationUnlocks : state.automationUnlocks,
            prestigeState: data.prestigeState && typeof data.prestigeState === 'object' ? { ...state.prestigeState, ...data.prestigeState, bonuses: Array.isArray(data.prestigeState.bonuses) ? data.prestigeState.bonuses : state.prestigeState.bonuses } : state.prestigeState,
            stats: data.stats && typeof data.stats === 'object' ? { ...state.stats, ...data.stats } : state.stats,
          });

          get().addNotification('success', 'Save imported successfully!');
          return true;
        } catch {
          return false;
        }
      },

      claimQuestReward: (questId: string) => {
        const state = get();
        const quest = state.quests.find(q => q.id === questId);
        if (!quest || quest.claimed || !quest.completed) return;

        const reward = quest.reward;
        const updates: Partial<GameState> = {
          money: state.money + reward.money,
          totalMoneyEarned: state.totalMoneyEarned + reward.money,
          researchPoints: state.researchPoints + (reward.researchPoints || 0),
          prestigeState: {
            ...state.prestigeState,
            corporationPoints: state.prestigeState.corporationPoints + (reward.corporationPoints || 0),
          },
          quests: state.quests.map(q =>
            q.id === questId ? { ...q, claimed: true } : q
          ),
        };

        set(updates);
        soundEngine.play('moneyEarned', 'building');
        get().addNotification('success', `Quest reward claimed: ${quest.name}! +$${formatNumber(reward.money)}${reward.researchPoints ? ` +${reward.researchPoints} RP` : ''}${reward.corporationPoints ? ` +${reward.corporationPoints} CP` : ''}`);
      },

      updateQuestProgress: (type: string, amount: number, targetId?: string) => {
        const state = get();

        // For 'reach' type quests, check current game state directly
        if (type === 'reach') {
          const efficiency = state.powerGrid.efficiency * 100;
          const newQuests = state.quests.map(q => {
            if (q.claimed || q.completed || q.type !== 'reach') return q;
            const newSteps = q.steps.map(s => {
              if (s.completed) return s;
              // Power efficiency reach quest
              if (s.description.toLowerCase().includes('efficiency')) {
                const newCurrent = Math.min(Math.round(efficiency), s.target);
                return { ...s, current: newCurrent, completed: newCurrent >= s.target };
              }
              // Generic reach: just set current to amount
              const newCurrent = Math.min(amount, s.target);
              return { ...s, current: newCurrent, completed: newCurrent >= s.target };
            });
            const allStepsComplete = newSteps.every(s => s.completed);
            return { ...q, steps: newSteps, completed: allStepsComplete };
          });
          set({ quests: newQuests });
          return;
        }

        // For 'earn' type quests, track totalMoneyEarned
        if (type === 'earn') {
          const newQuests = state.quests.map(q => {
            if (q.claimed || q.completed || q.type !== 'earn') return q;
            const newSteps = q.steps.map(s => {
              if (s.completed) return s;
              const newCurrent = Math.min(state.totalMoneyEarned, s.target);
              return { ...s, current: newCurrent, completed: newCurrent >= s.target };
            });
            const allStepsComplete = newSteps.every(s => s.completed);
            return { ...q, steps: newSteps, completed: allStepsComplete };
          });
          set({ quests: newQuests });
          return;
        }

        // For 'produce' type quests with targetResource
        if (type === 'produce' && targetId) {
          const newQuests = state.quests.map(q => {
            if (q.claimed || q.completed || q.type !== 'produce') return q;
            // Only update quests that match the target resource
            if (q.targetResource && q.targetResource !== targetId) return q;
            const newSteps = q.steps.map(s => {
              if (s.completed) return s;
              const newCurrent = s.current + amount;
              const stepCompleted = newCurrent >= s.target;
              return { ...s, current: newCurrent, completed: stepCompleted };
            });
            const allStepsComplete = newSteps.every(s => s.completed);
            return { ...q, steps: newSteps, completed: allStepsComplete };
          });
          set({ quests: newQuests });
          return;
        }

        // For 'build' type quests with targetBuilding
        if (type === 'build' && targetId) {
          const newQuests = state.quests.map(q => {
            if (q.claimed || q.completed || q.type !== 'build') return q;
            // If quest has a specific targetBuilding, only update quests for that building
            if (q.targetBuilding && q.targetBuilding !== targetId) {
              // Still update generic build quests (no targetBuilding)
              // But skip quests for different buildings
            }
            const newSteps = q.steps.map(s => {
              if (s.completed) return s;
              const newCurrent = s.current + amount;
              const stepCompleted = newCurrent >= s.target;
              return { ...s, current: newCurrent, completed: stepCompleted };
            });
            const allStepsComplete = newSteps.every(s => s.completed);
            return { ...q, steps: newSteps, completed: allStepsComplete };
          });
          set({ quests: newQuests });
          return;
        }

        // Default: generic type matching (for sell, research, contract, transport, worker, prestige, megaProject)
        const newQuests = state.quests.map(q => {
          if (q.claimed || q.completed) return q;
          if (q.type !== type) return q;

          const newSteps = q.steps.map(s => {
            if (s.completed) return s;
            const newCurrent = s.current + amount;
            const stepCompleted = newCurrent >= s.target;
            return { ...s, current: newCurrent, completed: stepCompleted };
          });

          const allStepsComplete = newSteps.every(s => s.completed);
          return { ...q, steps: newSteps, completed: allStepsComplete };
        });

        set({ quests: newQuests });
      },

      resetGame: () => set(createInitialState()),

      getNewsLLMState: () => getLLMState(),

      refreshNewsFromLLM: (updates) => {
        const state = get();
        const updatedNews = state.marketNews.map(n => {
          const update = updates.find(u => u.id === n.id);
          if (update) {
            return { ...n, title: update.title, description: update.description, textSource: 'llm' as const };
          }
          return n;
        });
        set({ marketNews: updatedNews });
      },

      // --- PAYOUT ACTIONS ---
      collectPayout: () => {
        const state = get();
        if (state.pendingPayout <= 0) return;
        const amount = state.pendingPayout;
        set({
          money: state.money + amount,
          totalMoneyEarned: state.totalMoneyEarned + amount,
          pendingPayout: 0,
        });
        soundEngine.play('moneyEarned', 'building');
        get().addNotification('success', `💰 Collected payout: $${formatNumber(amount)}`);
      },

      toggleAutoCollect: () => {
        const state = get();
        set({
          payoutConfig: {
            ...state.payoutConfig,
            autoCollect: !state.payoutConfig.autoCollect,
          },
        });
      },

      // --- DRONE ACTIONS ---
      buyDrone: () => {
        const state = get();
        const cost = 2000 * state.drones.fleet.length;
        if (state.money < cost) {
          soundEngine.play('error', 'building');
          get().addNotification('error', `Not enough money to buy drone. Need $${formatNumber(cost)}`);
          return;
        }
        const newDrone: Drone = {
          id: generateId(),
          status: 'idle',
          missionEndTick: 0,
          missionId: null,
          speedLevel: 1,
          capacityLevel: 1,
          fuelEfficiencyLevel: 1,
        };
        set({
          money: state.money - cost,
          drones: {
            ...state.drones,
            fleet: [...state.drones.fleet, newDrone],
          },
        });
        soundEngine.play('buildingPlaced', 'building');
        get().addNotification('success', `🚁 New drone purchased for $${formatNumber(cost)}!`);
      },

      sendDrone: (missionId: string, droneId: string) => {
        const state = get();
        const drone = state.drones.fleet.find(d => d.id === droneId);
        if (!drone || drone.status !== 'idle') return;

        // Generate missions to find the one with matching id
        const missions = generateDroneMissionsFromState(state);
        const mission = missions.find(m => m.id === missionId);
        if (!mission) return;

        // Calculate fuel cost with efficiency upgrade
        const fuelCost = Math.ceil(mission.fuelCost / (1 + (drone.fuelEfficiencyLevel - 1) * getBalance().drone.fuelEfficiencyUpgradeCoeff));
        if (state.money < fuelCost) {
          soundEngine.play('error', 'building');
          get().addNotification('error', `Not enough money for fuel. Need $${formatNumber(fuelCost)}`);
          return;
        }

        // Calculate delivery time with speed upgrade
        const deliveryTicks = Math.max(10, Math.floor(mission.baseTicks / (1 + (drone.speedLevel - 1) * getBalance().drone.speedUpgradeCoeff)));

        const updatedFleet = state.drones.fleet.map(d =>
          d.id === droneId
            ? { ...d, status: 'delivering' as const, missionEndTick: state.gameTick + deliveryTicks, missionId }
            : d
        );

        set({
          money: state.money - fuelCost,
          drones: {
            ...state.drones,
            fleet: updatedFleet,
          },
        });
        soundEngine.play('buttonClick', 'building');
      },

      upgradeDrone: (droneId: string, type: 'speed' | 'capacity' | 'fuelEfficiency') => {
        const state = get();
        const drone = state.drones.fleet.find(d => d.id === droneId);
        if (!drone) return;

        const levelKey = type === 'speed' ? 'speedLevel' : type === 'capacity' ? 'capacityLevel' : 'fuelEfficiencyLevel';
        const currentLevel = drone[levelKey];
        if (currentLevel >= 5) {
          get().addNotification('warning', 'This drone upgrade is already at max level!');
          return;
        }

        const costMultiplier = type === 'speed' ? 500 : type === 'capacity' ? 800 : 600;
        const cost = costMultiplier * currentLevel;
        if (state.money < cost) {
          soundEngine.play('error', 'building');
          get().addNotification('error', `Not enough money for upgrade. Need $${formatNumber(cost)}`);
          return;
        }

        const updatedFleet = state.drones.fleet.map(d =>
          d.id === droneId
            ? { ...d, [levelKey]: currentLevel + 1 }
            : d
        );

        set({
          money: state.money - cost,
          drones: {
            ...state.drones,
            fleet: updatedFleet,
          },
        });
        soundEngine.play('buildingPlaced', 'building');
      },

      generateDroneMissions: () => {
        return generateDroneMissionsFromState(get());
      },

      // --- LEADERBOARD ACTIONS ---
      addLeaderboardEntry: (entry: LeaderboardEntry) => {
        const state = get();
        const updatedEntries = [...state.leaderboardEntries, entry]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((e, i) => ({ ...e, rank: i + 1 }));
        set({ leaderboardEntries: updatedEntries });
      },

      // --- DAILY REWARDS ---
      checkDailyLogin: () => {
        const state = get();
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const loginStreak = { ...state.loginStreak };

        // Already logged in today
        if (loginStreak.lastLoginDate === today) return;

        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // Update streak
        if (loginStreak.lastLoginDate === yesterday) {
          loginStreak.currentStreak++;
        } else if (loginStreak.lastLoginDate === '') {
          // First time ever
          loginStreak.currentStreak = 1;
        } else {
          // Missed a day, reset streak
          loginStreak.currentStreak = 1;
        }

        loginStreak.lastLoginDate = today;
        loginStreak.totalLogins++;

        // Update longest streak
        if (loginStreak.currentStreak > loginStreak.longestStreak) {
          loginStreak.longestStreak = loginStreak.currentStreak;
        }

        // Determine which day of the week (1-7, cycles)
        const dayOfWeek = ((loginStreak.currentStreak - 1) % 7) + 1;

        // Generate weekly rewards if none exist or if the week has cycled
        const needsNewRewards = loginStreak.weeklyRewards.length === 0 ||
          loginStreak.weeklyRewards.every(r => r.claimed);

        if (needsNewRewards) {
          const multiplier = getStreakMultiplier(loginStreak.currentStreak);
          loginStreak.weeklyRewards = WEEKLY_DAILY_REWARDS.map(r => ({
            ...r,
            amount: Math.floor(r.amount * multiplier),
            claimed: false,
          }));
        }

        // Mark today's reward as available (not claimed yet)
        // The reward for today should be unclaimed
        const todayReward = loginStreak.weeklyRewards.find(r => r.day === dayOfWeek && !r.claimed);
        if (!todayReward) {
          // Generate a fresh set for this day
          const multiplier = getStreakMultiplier(loginStreak.currentStreak);
          loginStreak.weeklyRewards = WEEKLY_DAILY_REWARDS.map(r => ({
            ...r,
            amount: Math.floor(r.amount * multiplier),
            claimed: r.day < dayOfWeek, // Past days are auto-claimed
          }));
        }

        set({ loginStreak });
      },

      claimDailyReward: (day: number) => {
        const state = get();
        const loginStreak = { ...state.loginStreak, weeklyRewards: [...state.loginStreak.weeklyRewards] };
        const rewardIndex = loginStreak.weeklyRewards.findIndex(r => r.day === day && !r.claimed);
        if (rewardIndex === -1) return;

        const reward = loginStreak.weeklyRewards[rewardIndex];
        loginStreak.weeklyRewards[rewardIndex] = { ...reward, claimed: true };

        // Apply reward
        const updates: Partial<GameState> = { loginStreak };

        switch (reward.type) {
          case 'money':
            updates.money = state.money + reward.amount;
            updates.totalMoneyEarned = state.totalMoneyEarned + reward.amount;
            break;
          case 'researchPoints':
            updates.researchPoints = state.researchPoints + reward.amount;
            break;
          case 'resources':
            if (reward.resource) {
              const res = reward.resource;
              const newResources = { ...state.resources };
              newResources[res] = Math.min(getCapacity(state, res), newResources[res] + reward.amount);
              updates.resources = newResources;
            }
            break;
          case 'corporationPoints':
            updates.prestigeState = {
              ...state.prestigeState,
              corporationPoints: state.prestigeState.corporationPoints + reward.amount,
            };
            // Day 7 JACKPOT also gives $2,000
            if (day === 7) {
              updates.money = (updates.money ?? state.money) + 2000;
              updates.totalMoneyEarned = (updates.totalMoneyEarned ?? state.totalMoneyEarned) + 2000;
            }
            break;
        }

        set(updates as Record<string, unknown>);
        soundEngine.play('moneyEarned', 'building');
        get().addNotification('success', `Claimed daily reward: Day ${day}!`);
      },

      // --- QUEST ACTIONS ---
      claimQuestReward: (questId: string) => {
        const state = get();
        const quest = state.quests.find(q => q.id === questId);
        if (!quest || !quest.completed || quest.claimed) return;
        
        set({
          money: state.money + quest.reward.money,
          researchPoints: state.researchPoints + (quest.reward.researchPoints ?? 0),
          prestigeState: {
            ...state.prestigeState,
            corporationPoints: state.prestigeState.corporationPoints + (quest.reward.corporationPoints ?? 0),
          },
          quests: state.quests.map(q =>
            q.id === questId ? { ...q, claimed: true } : q
          ),
        });
        soundEngine.play('moneyEarned', 'events');
        get().addNotification('success', `Claimed quest reward: ${quest.name}!`);
      },

      updateQuestProgress: (type: string, amount: number, targetId?: string) => {
        const state = get();
        // Delegate to the main updateQuestProgress logic
        // This is a simplified version for the second store definition
        set({
          quests: state.quests.map(q => {
            if (q.completed || q.claimed) return q;
            if (q.type !== type) return q;
            // For produce quests with targetResource, only match if resource matches
            if (type === 'produce' && q.targetResource && targetId && q.targetResource !== targetId) return q;
            return {
              ...q,
              steps: q.steps.map(s => {
                const newCurrent = Math.min(s.target, s.current + amount);
                return { ...s, current: newCurrent, completed: newCurrent >= s.target };
              }),
              completed: q.steps.every(s => (s.current + amount) >= s.target),
            };
          }),
        });
      },

      setTrackedQuest: (id: string | null) => {
        set({ trackedQuest: id });
      },

      // --- STORAGE UPGRADE ACTIONS ---
      upgradeStorage: (resource: ResourceType, levels: number) => {
        const state = get();
        const currentLevel = state.storageUpgradeLevels[resource] ?? 0;
        let totalCost = 0;
        for (let i = 0; i < levels; i++) {
          totalCost += Math.floor(100 * Math.pow(getBalance().storage.upgradeCostExponent, currentLevel + i));
        }

        if (state.money < totalCost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `Not enough money! Need $${formatNumber(totalCost)} to upgrade storage`);
          return;
        }

        const baseCapacity = initialCapacity[resource];
        const addedCapacity = baseCapacity * getBalance().storage.upgradeCapacityRatio * levels;
        const newCapacity = { ...state.resourceCapacity, [resource]: state.resourceCapacity[resource] + addedCapacity };
        const newUpgradeLevels = { ...state.storageUpgradeLevels, [resource]: currentLevel + levels };

        set({
          money: state.money - totalCost,
          resourceCapacity: newCapacity,
          storageUpgradeLevels: newUpgradeLevels,
        });
        soundEngine.play('buildingPlaced', 'building');
        get().addNotification('success', `Upgraded ${RESOURCE_META[resource].name} storage to +${Math.floor(addedCapacity)} capacity`);
      },

      // --- OFFLINE PROGRESS ---
      calculateOfflineProgress: () => {
        const state = get();
        const now = Date.now();
        const elapsed = now - state.lastOnlineTimestamp;
        if (elapsed < 5000) return null; // Less than 5 seconds, ignore

        const ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000); // Cap at 10 hours
        if (ticksElapsed <= 0) return null;

        // Use Modifier Engine for consistent bonus calculations with gameTick
        const cache = buildMultipliers(state);
        const offlineRate = cache.modifierEngine?.resolve('offline.rate', 0.5) ?? 0.5;
        const effectiveOfflineRate = offlineRate * (1 + cache.productionBonus);

        // Calculate production per tick for each building using the same formula engine
        const offlineResources: Record<ResourceType, number> = { ...initialResources };
        let offlineMoney = 0;
        const offlineTempResources: Record<string, number> = { ...state.resources };

        state.buildings.forEach(b => {
          if (!b.active) return;
          const def = BUILDING_DEFS[b.type];
          if (!def || !def.outputs) return;

          if (def.category === 'extractor') {
            def.outputs.forEach(output => {
              if (output.resource === 'money') return;
              const res = output.resource as ResourceType;
              // Apply same multipliers as gameTick: category bonuses + weather + transport + offline rate
              const categoryBonus = def.category === 'extractor' ? cache.extractorBonus : cache.factoryBonus;
              const tierBonus = def.tier === 1 ? cache.t1FactoryBonus : def.tier === 2 ? cache.t2FactoryBonus : def.tier === 3 ? cache.t3FactoryBonus : 0;
              const buildingBonus = cache.specificBuildingBonuses.get(b.type) ?? 0;
              const produced = output.amount * def.baseProductionRate * b.level * b.efficiency
                * (1 + categoryBonus + tierBonus + buildingBonus)
                * cache.weatherProduction
                * cache.transportProductionBonus
                * effectiveOfflineRate * ticksElapsed;
              offlineResources[res] += produced;
              offlineTempResources[res] = (offlineTempResources[res] ?? 0) + produced;
            });
          }

          if (def.category === 'factory' && def.inputs && def.outputs) {
            // Check if factory can produce (has enough input resources)
            const categoryBonus = cache.factoryBonus;
            const tierBonus = def.tier === 1 ? cache.t1FactoryBonus : def.tier === 2 ? cache.t2FactoryBonus : def.tier === 3 ? cache.t3FactoryBonus : 0;
            const buildingBonus = cache.specificBuildingBonuses.get(b.type) ?? 0;
            const efficiencyMultiplier = (1 + categoryBonus + tierBonus + buildingBonus)
              * cache.weatherProduction
              * cache.transportProductionBonus;

            const adjustedInputs = def.inputs.map(input => {
              if (input.resource === 'money') return { resource: input.resource, amount: 0 };
              return {
                resource: input.resource,
                amount: input.amount * b.level * b.efficiency * effectiveOfflineRate * ticksElapsed,
              };
            }).filter(i => i.resource !== 'money');

            let canProduce = true;
            for (const input of adjustedInputs) {
              const res = input.resource as ResourceType;
              if ((offlineTempResources[res] ?? 0) < input.amount) {
                canProduce = false;
                break;
              }
            }

            if (canProduce) {
              // Consume inputs
              adjustedInputs.forEach(input => {
                const res = input.resource as ResourceType;
                offlineTempResources[res] = (offlineTempResources[res] ?? 0) - input.amount;
                // Also reduce offline resources for inputs (they came from stock)
                if (offlineResources[res] !== undefined) {
                  offlineResources[res] = Math.max(0, offlineResources[res] - input.amount);
                }
              });
              // Produce outputs
              def.outputs.forEach(output => {
                if (output.resource === 'money') return;
                const res = output.resource as ResourceType;
                const produced = output.amount * def.baseProductionRate * b.level * b.efficiency
                  * efficiencyMultiplier
                  * effectiveOfflineRate * ticksElapsed;
                offlineResources[res] += produced;
                offlineTempResources[res] = (offlineTempResources[res] ?? 0) + produced;
              });
            }
          }
        });

        // Apply capacity limits to offline resources (using modifier engine for capacity)
        (Object.keys(offlineResources) as ResourceType[]).forEach(r => {
          offlineResources[r] = Math.min(offlineResources[r], Math.max(0, getCapacity(state, r, undefined, cache) - state.resources[r]));
        });

        // Calculate offline money from market sales (reduced rate)
        if (state.automationUnlocks.find(a => a.type === 'autoTrading' && a.active)) {
          (Object.keys(state.resources) as ResourceType[]).forEach(r => {
            const excess = state.resources[r] - getCapacity(state, r, undefined, cache) * getBalance().offline.autoTradeThresholdRatio;
            if (excess > 0) {
              const marketPrice = state.market.find(m => m.resource === r)?.currentPrice ?? 0;
              const sellAmount = Math.min(excess, Math.floor(ticksElapsed * getBalance().offline.autoSellRate));
              const sellMultiplier = computeSellMultiplier(state, cache);
              offlineMoney += sellAmount * marketPrice * sellMultiplier;
            }
          });
        }

        return {
          resources: offlineResources,
          money: offlineMoney,
          ticksElapsed,
        };
      },

      collectOfflineProgress: (offlineData) => {
        const state = get();
        const cache = buildMultipliers(state);
        const newResources = { ...state.resources };
        (Object.keys(offlineData.resources) as ResourceType[]).forEach(r => {
          newResources[r] = Math.min(getCapacity(state, r, undefined, cache), newResources[r] + offlineData.resources[r]);
        });

        set({
          resources: newResources,
          money: state.money + offlineData.money,
          totalMoneyEarned: state.totalMoneyEarned + offlineData.money,
          lastOnlineTimestamp: Date.now(),
        });
      },

      // --- RANK SYSTEM ---
      getCurrentRank: () => {
        const state = get();
        const score = Math.floor(
          state.totalMoneyEarned +
          state.buildings.length * 100 +
          state.completedResearch.length * 200 +
          state.stats.contractsCompleted * 50 +
          state.prestigeState.totalPrestiges * 500
        );

        let currentRank = RANK_THRESHOLDS[0];
        let nextRank = RANK_THRESHOLDS[1] ?? null;
        for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
          if (score >= RANK_THRESHOLDS[i].minScore) {
            currentRank = RANK_THRESHOLDS[i];
            nextRank = RANK_THRESHOLDS[i + 1] ?? null;
            break;
          }
        }

        const progress = nextRank
          ? (score - currentRank.minScore) / (nextRank.minScore - currentRank.minScore)
          : 1;

        return {
          name: currentRank.name,
          icon: currentRank.icon,
          color: currentRank.color,
          score,
          nextRankScore: nextRank ? nextRank.minScore : null,
          progress: Math.min(1, Math.max(0, progress)),
        };
      },

      // --- GAME TIER ---
      getPlayerGameTier: () => {
        const state = get();
        if (state.buildings.length === 0) return 0;
        const highestBuildingTier = Math.max(0, ...state.buildings.map(b => BUILDING_DEFS[b.type]?.tier ?? 0));
        const researchTier = Math.floor(state.completedResearch.length / 3);
        return Math.min(4, Math.max(highestBuildingTier, researchTier));
      },

      // --- MEGAPROJECT ACTIONS ---
      startMegaProject: (type: MegaProjectType) => {
        const state = get();
        const project = state.megaProjects.find(p => p.type === type);
        if (!project) return;

        if (project.active) {
          get().addNotification('warning', `${project.name} is already active!`);
          return;
        }

        if (project.completed) {
          get().addNotification('warning', `${project.name} is already completed!`);
          return;
        }

        // Check unlock requirements
        const req = project.unlockRequirement;
        if (req.buildings && state.buildings.length < req.buildings) {
          get().addNotification('error', `Need ${req.buildings} buildings! Have ${state.buildings.length}`);
          return;
        }
        if (req.research && state.completedResearch.length < req.research) {
          get().addNotification('error', `Need ${req.research} research! Have ${state.completedResearch.length}`);
          return;
        }
        if (req.prestige && state.prestigeState.totalPrestiges < req.prestige) {
          get().addNotification('error', `Need ${req.prestige} prestiges! Have ${state.prestigeState.totalPrestiges}`);
          return;
        }

        set({
          megaProjects: state.megaProjects.map(p =>
            p.type === type ? { ...p, active: true } : p
          ),
        });
        get().addNotification('info', `Mega Project started: ${project.name}! Maintain required resources to keep construction progressing.`);
      },

      contributeToMegaProject: (type: MegaProjectType) => {
        const state = get();
        const project = state.megaProjects.find(p => p.type === type);
        if (!project || !project.active || project.completed) return;

        const stage = project.stages[project.currentStage];
        if (!stage || stage.completed) return;

        // Check if player has all required resources
        const canContribute = stage.requiredResources.every(r => {
          if (r.resource === 'money') return state.money >= r.amount;
          return state.resources[r.resource as ResourceType] >= r.amount;
        });

        if (!canContribute) {
          get().addNotification('error', `Not enough resources for ${stage.name}! Resources must be held for construction to progress.`);
          return;
        }

        // Resources are NOT deducted upfront — they must be maintained throughout construction.
        // Progress auto-ticks each game tick as long as all required resources are available.
        // Resources are deducted only when the stage completes.
        get().addNotification('info', `${project.name}: ${stage.name} — Resources confirmed. Construction will progress as long as resources remain available.`);
      },

      // --- BLUEPRINT ACTIONS ---
      saveBlueprint: (name: string) => {
        const state = get();

        // Group buildings by type with counts
        const buildingCounts: Record<string, number> = {};
        state.buildings.forEach(b => {
          buildingCounts[b.type] = (buildingCounts[b.type] || 0) + 1;
        });
        const buildings = Object.entries(buildingCounts).map(([type, count]) => ({
          type: type as BuildingType,
          count,
        }));

        // Group transport lines by type with counts
        const transportCounts: Record<string, number> = {};
        state.transportLines.forEach(t => {
          transportCounts[t.type] = (transportCounts[t.type] || 0) + 1;
        });
        const transportLines = Object.entries(transportCounts).map(([type, count]) => ({
          type: type as TransportType,
          count,
        }));

        const blueprint: Blueprint = {
          id: generateId(),
          name,
          buildings,
          transportLines,
          savedAt: Date.now(),
          shared: false,
          likes: 0,
        };

        set({ blueprints: [blueprint, ...state.blueprints] });
        get().addNotification('success', `Blueprint saved: ${name}`);
      },

      loadBlueprint: (id: string) => {
        const state = get();
        const blueprint = state.blueprints.find(bp => bp.id === id);
        if (!blueprint) {
          get().addNotification('error', 'Blueprint not found!');
          return;
        }

        // Build all missing buildings from the blueprint
        let builtCount = 0;
        let skippedCount = 0;
        blueprint.buildings.forEach(bpBuilding => {
          const currentCount = state.buildings.filter(b => b.type === bpBuilding.type).length;
          const needed = bpBuilding.count - currentCount;

          for (let i = 0; i < needed; i++) {
            const def = BUILDING_DEFS[bpBuilding.type];
            if (!def) { skippedCount++; continue; }

            const cost = getBuildingCost(bpBuilding.type, currentCount + i, getMegaProjectBonus(state.megaProjects, 'buildingCostReduction'));
            if (state.money < cost) { skippedCount++; continue; }

            if (!isBuildingUnlocked(bpBuilding.type, state.completedResearch, state.prestigeState)) {
              skippedCount++;
              continue;
            }

            const building: BuildingInstance = {
              id: generateId(),
              type: bpBuilding.type,
              level: 1,
              active: true,
              efficiency: 1,
              placedAt: state.gameTick,
            };

            state.money -= cost;
            state.buildings = [...state.buildings, building];
            state.stats = { ...state.stats, factoriesBuilt: state.stats.factoriesBuilt + 1 };
            builtCount++;
          }
        });

        set({
          money: state.money,
          buildings: state.buildings,
          stats: state.stats,
        });

        if (builtCount > 0) {
          get().addNotification('success', `Loaded blueprint "${blueprint.name}": Built ${builtCount} buildings${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
        } else {
          get().addNotification('warning', `No new buildings needed from blueprint "${blueprint.name}"`);
        }
      },

      deleteBlueprint: (id: string) => {
        const state = get();
        set({ blueprints: state.blueprints.filter(bp => bp.id !== id) });
        get().addNotification('info', 'Blueprint deleted');
      },

      renameBlueprint: (id: string, name: string) => {
        const state = get();
        set({
          blueprints: state.blueprints.map(bp =>
            bp.id === id ? { ...bp, name } : bp
          ),
        });
      },

      exportBlueprint: (id: string) => {
        const state = get();
        const blueprint = state.blueprints.find(bp => bp.id === id);
        if (!blueprint) return '';

        try {
          const exportData = {
            n: blueprint.name,
            b: blueprint.buildings.map(b => ({ t: b.type, c: b.count })),
            t: blueprint.transportLines.map(t => ({ t: t.type, c: t.count })),
            v: 1,
          };
          const json = JSON.stringify(exportData);
          return btoa(encodeURIComponent(json));
        } catch {
          return '';
        }
      },

      importBlueprint: (code: string) => {
        try {
          const json = decodeURIComponent(atob(code));
          const data = JSON.parse(json);

          if (!data.b || !Array.isArray(data.b) || !data.t || !Array.isArray(data.t)) {
            get().addNotification('error', 'Invalid blueprint code!');
            return false;
          }

          const blueprint: Blueprint = {
            id: generateId(),
            name: data.n || `Imported Layout`,
            buildings: data.b.map((b: { t: string; c: number }) => ({
              type: b.t as BuildingType,
              count: b.c,
            })),
            transportLines: data.t.map((t: { t: string; c: number }) => ({
              type: t.t as TransportType,
              count: t.c,
            })),
            savedAt: Date.now(),
            shared: true,
            likes: 0,
          };

          const state = get();
          set({ blueprints: [blueprint, ...state.blueprints] });
          get().addNotification('success', `Blueprint imported: ${blueprint.name}`);
          return true;
        } catch {
          get().addNotification('error', 'Invalid blueprint code!');
          return false;
        }
      },
    }),
    {
      name: 'factory-dominion-save',
      storage: debouncedPersistStorage,
      partialize: (state) => ({
        money: state.money,
        totalMoneyEarned: state.totalMoneyEarned,
        gameTick: state.gameTick,
        resources: state.resources,
        resourceCapacity: state.resourceCapacity,
        buildings: state.buildings,
        transportLines: state.transportLines,
        researchPoints: state.researchPoints,
        completedResearch: state.completedResearch,
        workers: state.workers,
        contracts: state.contracts,
        completedContracts: state.completedContracts,
        automationUnlocks: state.automationUnlocks,
        prestigeState: state.prestigeState,
        stats: state.stats,
        megaProjects: state.megaProjects,
        productionHistory: state.productionHistory,
        blueprints: state.blueprints,
        autoSellResources: state.autoSellResources,
        storageUpgradeLevels: state.storageUpgradeLevels,
        lastOnlineTimestamp: state.lastOnlineTimestamp,
        leaderboardEntries: state.leaderboardEntries,
        loginStreak: state.loginStreak,
        weather: state.weather,
        quests: state.quests,
        payoutConfig: state.payoutConfig,
        pendingPayout: state.pendingPayout,
        payoutHistory: state.payoutHistory,
        trackedQuest: state.trackedQuest,
        drones: state.drones,
        _version: SAVE_VERSION,
      }),
      version: SAVE_VERSION,
      migrate: (persistedState: unknown, savedVersion: number) => {
        return migrateSaveState(persistedState as Record<string, unknown>, savedVersion);
      },
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('[Zustand Persist] Rehydration error:', error);
            // If rehydration fails due to corrupted data, clear the save
            try {
              localStorage.removeItem('factory-dominion-save');
              console.warn('[Zustand Persist] Cleared corrupted save data');
            } catch {
              // Ignore
            }
          }
        };
      },
    }
  )
);

// Expose store to window for debugging/testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}

export { formatNumber, getBuildingCost, isBuildingUnlocked, isResearchUnlocked, generateId };

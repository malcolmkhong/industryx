// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Zustand Game Store + Game Engine
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GameState, GameTab, ResourceType, BuildingInstance, BuildingType,
  TransportLine, TransportType, Worker, WorkerType, Contract,
  GameEvent, GameNotification, PowerGrid, MarketPrice, MegaProjectType,
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
} from './data';
import { soundEngine } from './soundEngine';

// --- Save Version ---
const SAVE_VERSION = 9;

// --- Utility Functions ---
function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function formatNumber(n: number): string {
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

function getBuildingCost(type: BuildingType, currentCount: number): number {
  const def = BUILDING_DEFS[type];
  if (!def) return Infinity;
  const baseMoneyCost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 0;
  return Math.floor(baseMoneyCost * Math.pow(def.costMultiplier, currentCount));
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

function getCapacity(state: GameState, resource: ResourceType): number {
  const baseCapacity = state.resourceCapacity[resource] ?? 50;
  // Apply Storage Expansion research bonus (+50% capacity)
  const storageBonus = state.completedResearch.includes('storageExpansion') ? 0.5 : 0;
  return Math.floor(baseCapacity * (1 + storageBonus));
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
      const difficulty = 1 + i + j * 0.5;
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
function migrateSaveState(savedState: Record<string, unknown>): Record<string, unknown> {
  const version = (savedState._version as number) || 1;
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

  state._version = SAVE_VERSION;
  return state;
}

// --- Initial State ---
const initialResources: Record<ResourceType, number> = {
  iron: 0, copper: 0, coal: 0, oil: 0, sand: 0, lithium: 0, water: 0, rareEarth: 0,
  ironPlate: 0, copperWire: 0, plastic: 0, glass: 0, carbon: 0,
  circuit: 0, engine: 0, battery: 0, gear: 0, steel: 0,
  aiChip: 0, robotics: 0, quantumPart: 0, advancedAlloy: 0, nanoMaterial: 0,
};

const initialCapacity: Record<ResourceType, number> = {
  iron: 100, copper: 100, coal: 100, oil: 100, sand: 100, lithium: 50, water: 200, rareEarth: 20,
  ironPlate: 50, copperWire: 50, plastic: 50, glass: 50, carbon: 30,
  circuit: 30, engine: 20, battery: 30, gear: 40, steel: 40,
  aiChip: 10, robotics: 5, quantumPart: 5, advancedAlloy: 10, nanoMaterial: 3,
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
  updateQuestProgress: (type: string, amount: number) => void;
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
}

export type GameStore = GameState & GameActions;

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

        // Weather production multiplier (calculated early for power grid)
        const weatherDef = WEATHER_DEFS[state.weather.current as WeatherType];
        let weatherProductionMultiplier = 1;
        let weatherSolarMultiplier = 1;
        let weatherWindMultiplier = 1;
        let droneRpEarned = 0;
        if (weatherDef) {
          weatherProductionMultiplier = weatherDef.productionMultiplier;
          weatherSolarMultiplier = weatherDef.solarMultiplier;
          weatherWindMultiplier = weatherDef.windMultiplier;
        }

        // Calculate power grid
        let totalProduction = 0;
        let totalConsumption = 0;
        const powerBuildings = state.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power' && b.active);
        const consumingBuildings = state.buildings.filter(b => { const d = BUILDING_DEFS[b.type]; return d && d.category !== 'power' && b.active; });

        powerBuildings.forEach(b => {
          const def = BUILDING_DEFS[b.type];
          if (!def) return;
          let production = def.basePowerProduction * b.level * b.efficiency;
          if (def.fuel && def.fuelRate) {
            if (newResources[def.fuel] >= def.fuelRate * b.level) {
              newResources[def.fuel] -= def.fuelRate * b.level;
              totalProduction += production;
            } else {
              production *= 0.1;
              totalProduction += production;
            }
          } else {
            if (b.type === 'solarPanel') {
              const dayFactor = 0.5 + 0.5 * Math.sin(newTick * 0.01);
              production *= Math.max(0.2, dayFactor) * weatherSolarMultiplier;
            }
            if (b.type === 'windTurbine') {
              const windFactor = 0.5 + 0.5 * Math.sin(newTick * 0.007 + Math.PI / 3);
              production *= Math.max(0.3, windFactor) * weatherWindMultiplier;
            }
            totalProduction += production;
          }
        });

        consumingBuildings.forEach(b => {
          const def = BUILDING_DEFS[b.type];
          if (!def) return;
          totalConsumption += def.basePowerConsumption * b.level * b.efficiency;
        });

        const powerEfficiencyResearch = state.completedResearch.includes('energyEfficiency') ? 0.15 : 0;
        totalConsumption *= (1 - powerEfficiencyResearch);

        const overload = totalConsumption > totalProduction;

        // Play power overload sound when overload newly detected
        if (overload && !state.powerGrid.overload) {
          soundEngine.play('powerOverload', 'events');
        }

        // Apply event effects
        let eventProductionMultiplier = 1;
        let eventResearchMultiplier = 1;
        state.activeEvents.forEach(event => {
          event.effects.forEach(effect => {
            if (effect.type === 'productionMultiplier') eventProductionMultiplier *= effect.value;
            if (effect.type === 'researchSpeed') eventResearchMultiplier *= effect.value;
          });
        });

        // Production speed bonuses from research
        const extractorSpeedBonus = state.completedResearch.includes('basicAutomation') ? 0.15 : 0;
        const factorySpeedBonus = state.completedResearch.includes('advancedAutomation') ? 0.25 : 0;
        const workerEfficiencyBonus = state.completedResearch.includes('workerTraining') ? 0.25 : 0;
        const logistics1Bonus = state.completedResearch.includes('logistics1') ? 0.2 : 0;
        const advancedLogisticsBonus = state.completedResearch.includes('advancedLogistics') ? 0.3 : 0;
        const transportBonus = logistics1Bonus + advancedLogisticsBonus;

        // Prestige bonuses
        const productionPrestigeBonus = state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'productionMultiplier').reduce((sum, b) => sum + b.effect.value, 0);
        const powerPrestigeBonus = state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'powerMultiplier').reduce((sum, b) => sum + b.effect.value, 0);

        totalProduction *= (1 + powerPrestigeBonus);
        const effectivePowerEfficiency = totalProduction > 0 ? Math.min(1, totalProduction / Math.max(0.001, totalConsumption)) : 0;

        // Process buildings
        state.buildings.forEach(b => {
          if (!b.active) return;
          const def = BUILDING_DEFS[b.type];
          if (!def) return;

          let efficiency = b.efficiency * effectivePowerEfficiency * eventProductionMultiplier * weatherProductionMultiplier;
          
          if (def.category === 'extractor') efficiency *= (1 + extractorSpeedBonus);
          if (def.category === 'factory') efficiency *= (1 + factorySpeedBonus);
          
          const assignedWorkers = state.workers.filter(w => w.assignedTo === b.id);
          assignedWorkers.forEach(w => {
            const wDef = WORKER_DEFS[w.type];
            if (wDef) {
              efficiency *= (1 + wDef.effects.speed * w.level * (1 + workerEfficiencyBonus));
            }
          });

          efficiency *= (1 + productionPrestigeBonus);

          if (def.category === 'extractor' && def.outputs) {
            def.outputs.forEach(output => {
              if (output.resource === 'money') return;
              const res = output.resource as ResourceType;
              const produced = output.amount * b.level * efficiency;
              const capacity = newResources[res] + produced;
              newResources[res] = Math.min(getCapacity(state, res), capacity);
              newStats.totalResourcesProduced[res] += produced;
            });
          }

          if (def.category === 'factory') {
            if (def.inputs && def.outputs) {
              let canProduce = true;
              const adjustedInputs = def.inputs.map(input => {
                if (input.resource === 'money') return { resource: input.resource, amount: 0 };
                return {
                  resource: input.resource,
                  amount: input.amount * b.level * efficiency,
                };
              }).filter(i => i.resource !== 'money');

              for (const input of adjustedInputs) {
                const res = input.resource as ResourceType;
                if (newResources[res] < input.amount) {
                  canProduce = false;
                  break;
                }
              }

              if (canProduce) {
                adjustedInputs.forEach(input => {
                  const res = input.resource as ResourceType;
                  newResources[res] -= input.amount;
                });
                def.outputs.forEach(output => {
                  if (output.resource === 'money') return;
                  const res = output.resource as ResourceType;
                  const produced = output.amount * b.level * efficiency;
                  const capacity = newResources[res] + produced;
                  newResources[res] = Math.min(getCapacity(state, res), capacity);
                  newStats.totalResourcesProduced[res] += produced;
                });
              }
            }
          }
        });

        const transportEfficiency = state.transportLines.length > 0
          ? state.transportLines.filter(t => t.active).length / Math.max(1, state.transportLines.length)
          : 1;

        // Update market prices
        const newMarket = state.market.map(m => {
          const volatility = m.volatility;
          const change = (Math.random() - 0.5) * 2 * volatility;
          let newPrice = m.currentPrice * (1 + change * 0.1);
          
          state.activeEvents.forEach(event => {
            event.effects.forEach(effect => {
              if (effect.type === 'marketPriceMultiplier') {
                if (!effect.target || effect.target === m.resource) {
                  newPrice = m.basePrice * effect.value * (0.8 + Math.random() * 0.4);
                }
              }
            });
          });

          newPrice = newPrice * 0.95 + m.basePrice * 0.05;
          newPrice = Math.max(m.basePrice * 0.2, Math.min(m.basePrice * 5, newPrice));

          const newHistory = [...m.priceHistory, m.currentPrice].slice(-50);

          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (newHistory.length >= 5) {
            const recent = newHistory.slice(-5);
            const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            if (newPrice > avg * 1.05) trend = 'up';
            else if (newPrice < avg * 0.95) trend = 'down';
          }

          return {
            ...m,
            currentPrice: Math.round(newPrice * 100) / 100,
            priceHistory: newHistory,
            demand: Math.max(0.3, Math.min(2, m.demand + (Math.random() - 0.5) * 0.05)),
            supply: Math.max(0.3, Math.min(2, m.supply + (Math.random() - 0.5) * 0.05)),
            trend,
          };
        });

        // Process research
        let newResearchProgress = state.researchProgress;
        let newActiveResearch = state.activeResearch;
        let newCompletedResearch = [...state.completedResearch];
        let newResearchPoints = state.researchPoints;

        if (newActiveResearch) {
          const node = RESEARCH_TREE.find(r => r.id === newActiveResearch);
          if (node) {
            const researchSpeed = eventResearchMultiplier * (1 + state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'researchMultiplier').reduce((sum, b) => sum + b.effect.value, 0));
            newResearchProgress += researchSpeed;
            if (newResearchProgress >= node.timeRequired) {
              newCompletedResearch.push(newActiveResearch);
              newActiveResearch = null;
              newResearchProgress = 0;
              newResearchPoints += Math.floor(node.cost * 0.1);
              newStats.researchCompleted++;
              soundEngine.play('researchComplete', 'events');
              notifications.push({ id: generateId(), type: 'success', message: `Research complete: ${node.name}!`, gameTick: newTick, read: false });
            }
          }
        }

        newResearchPoints += 0.1 * (1 + state.buildings.filter(b => b.type === 'aiLab' && b.active).length * 0.5);

        // Add drone RP rewards
        newResearchPoints += droneRpEarned;

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
          experience: w.experience + 0.01 * (1 + workerEfficiencyBonus),
          efficiency: Math.min(2, w.efficiency + 0.001),
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

        if (newTick % 500 === 0 && Math.random() < 0.6 && newActiveEvents.length < 2) {
          const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
          const newEvent: GameEvent = {
            id: generateId(),
            type: template.type,
            name: template.name,
            description: template.description,
            duration: template.duration,
            remaining: template.duration,
            effects: template.effects,
            emoji: template.emoji,
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
                emoji: seasonal.emoji,
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
            intensity: selectedWeather === 'clear' ? 0 : 0.3 + Math.random() * 0.7,
            remaining: selectedWeather === 'clear' ? 0 : 100 + Math.floor(Math.random() * 300),
            nextChange: newTick + 200 + Math.floor(Math.random() * 400),
          };
          if (selectedWeather !== 'clear') {
            const wDef = WEATHER_DEFS[selectedWeather];
            notifications.push({ id: generateId(), type: 'info', message: `${wDef.emoji} Weather: ${wDef.name} - ${wDef.description}`, gameTick: newTick, read: false });
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
          const tierMultiplier = 1 + contractTier * 0.5; // Higher tier = proportionally higher rewards
          const reward = template.requiredResources.reduce((sum, r) => {
            const marketItem = INITIAL_MARKET.find(m => m.resource === r.resource);
            return sum + (marketItem?.basePrice ?? 10) * r.amount * tierMultiplier * (1 + difficulty * 0.15);
          }, 0);
          
          const contract: Contract = {
            id: generateId(),
            name: template.name,
            description: template.description,
            type: template.type,
            requiredResources: template.requiredResources.map(r => ({
              resource: r.resource,
              amount: Math.floor(r.amount * (1 + (difficulty - 1) * 0.15)),
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
            emoji: template.emoji,
          };
          contractsToAdd = [contract];
        }

        // Passive income from selling excess (if auto-trading is on)
        let moneyEarned = 0;
        if (autoFulfill) {
          (Object.keys(newResources) as ResourceType[]).forEach(r => {
            const excess = newResources[r] - getCapacity(state, r) * 0.8;
            if (excess > 0) {
              const marketPrice = newMarket.find(m => m.resource === r)?.currentPrice ?? 0;
              const sellPrice = marketPrice * 0.9;
              const sellAmount = Math.min(excess, 5);
              newResources[r] -= sellAmount;
              moneyEarned += sellAmount * sellPrice;
              newStats.totalResourcesSold[r] += sellAmount;
            }
          });
        }

        // Auto-sell specific resources when > 80% capacity
        if (state.autoSellResources.length > 0) {
          state.autoSellResources.forEach(r => {
            const threshold = getCapacity(state, r) * 0.8;
            const excess = newResources[r] - threshold;
            if (excess > 0) {
              const marketItem = newMarket.find(m => m.resource === r);
              if (marketItem) {
                const marketBonus = state.completedResearch.includes('marketAnalysis') ? 0.2 : 0;
                const prestigeMarketBonus = state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'marketMultiplier').reduce((sum, b) => sum + b.effect.value, 0);
                const sellPrice = marketItem.currentPrice * (0.9 + marketBonus + prestigeMarketBonus);
                const sellAmount = Math.min(excess, 10);
                newResources[r] -= sellAmount;
                moneyEarned += sellAmount * sellPrice;
                newStats.totalResourcesSold[r] += sellAmount;
              }
            }
          });
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
        const newMegaProjects = state.megaProjects.map(mp => {
          if (!mp.active || mp.completed) return mp;
          const stage = mp.stages[mp.currentStage];
          if (!stage || stage.completed) return mp;

          // Increment progress each tick (1 / timeRequired)
          const increment = 1 / stage.timeRequired;
          const newProgress = mp.progress + increment;

          if (newProgress >= 1) {
            // Stage complete
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
          // Calculate payout based on active buildings
          const activeBuildings = state.buildings.filter(b => b.active);
          const extractors = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor');
          const factories = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory');
          const powerPlants = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');

          // Base rates per building type per payout cycle
          const extractorRate = 2;
          const factoryRate = 5;
          const powerRate = 1;

          const extractorIncome = extractors.reduce((sum, b) => sum + extractorRate * b.level * b.efficiency, 0);
          const factoryIncome = factories.reduce((sum, b) => sum + factoryRate * b.level * b.efficiency, 0);
          const powerIncome = powerPlants.reduce((sum, b) => sum + powerRate * b.level * b.efficiency, 0);

          let rawPayout = extractorIncome + factoryIncome + powerIncome;

          // Apply game speed multiplier
          rawPayout *= state.gameSpeed;

          // Apply average efficiency modifier
          const avgEfficiency = activeBuildings.length > 0
            ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length
            : 0;
          rawPayout *= avgEfficiency;

          // Apply prestige bonuses
          const payoutPrestigeBonus = state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'productionMultiplier').reduce((sum, b) => sum + b.effect.value, 0);
          rawPayout *= (1 + payoutPrestigeBonus);

          // Apply event production multiplier
          rawPayout *= eventProductionMultiplier;

          // Apply weather modifier
          rawPayout *= weatherProductionMultiplier;

          const payoutAmount = Math.floor(rawPayout);

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
              const capacityMult = 1 + (d.capacityLevel - 1) * 0.25;
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
        });
      },

      setGameSpeed: (speed: number) => set({ gameSpeed: speed }),
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
        const cost = getBuildingCost(type, currentCount);

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
        get().updateQuestProgress('build', 1);
      },

      upgradeBuilding: (id: string) => {
        const state = get();
        const building = state.buildings.find(b => b.id === id);
        if (!building) return;

        const def = BUILDING_DEFS[building.type];
        const cost = getBuildingCost(building.type, building.level);

        if (state.money < cost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `Not enough money! Need $${formatNumber(cost)} to upgrade`);
          return;
        }

        set({
          money: state.money - cost,
          buildings: state.buildings.map(b =>
            b.id === id ? { ...b, level: b.level + 1, efficiency: Math.min(2, b.efficiency + 0.05) } : b
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
        let totalProduction = 0;
        let totalConsumption = 0;
        const powerBuildings = newBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power' && b.active);
        const consumingBuildings = newBuildings.filter(b => { const d = BUILDING_DEFS[b.type]; return d && d.category !== 'power' && b.active; });
        const newResources = { ...state.resources };

        powerBuildings.forEach(b => {
          const bDef = BUILDING_DEFS[b.type];
          if (!bDef) return;
          let production = bDef.basePowerProduction * b.level * b.efficiency;
          if (bDef.fuel && bDef.fuelRate) {
            if (state.resources[bDef.fuel] >= bDef.fuelRate * b.level) {
              totalProduction += production;
            } else {
              production *= 0.1;
              totalProduction += production;
            }
          } else {
            if (b.type === 'solarPanel') {
              const dayFactor = 0.5 + 0.5 * Math.sin(state.gameTick * 0.01);
              production *= Math.max(0.2, dayFactor);
            }
            if (b.type === 'windTurbine') {
              const windFactor = 0.5 + 0.5 * Math.sin(state.gameTick * 0.007 + Math.PI / 3);
              production *= Math.max(0.3, windFactor);
            }
            totalProduction += production;
          }
        });

        consumingBuildings.forEach(b => {
          const bDef = BUILDING_DEFS[b.type];
          if (!bDef) return;
          totalConsumption += bDef.basePowerConsumption * b.level * b.efficiency;
        });

        const powerEfficiencyResearch = state.completedResearch.includes('energyEfficiency') ? 0.15 : 0;
        totalConsumption *= (1 - powerEfficiencyResearch);

        const powerPrestigeBonus = state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'powerMultiplier').reduce((sum, b) => sum + b.effect.value, 0);
        totalProduction *= (1 + powerPrestigeBonus);

        const effectivePowerEfficiency = totalProduction > 0 ? Math.min(1, totalProduction / Math.max(0.001, totalConsumption)) : 0;
        const overload = totalConsumption > totalProduction;

        // Play sound for power toggle
        if (def?.category === 'power') {
          soundEngine.play(newActive ? 'buildPlace' : 'powerOverload', 'events');
        }

        set({
          buildings: newBuildings,
          powerGrid: {
            totalProduction,
            totalConsumption,
            efficiency: effectivePowerEfficiency,
            overload,
            plants: powerBuildings,
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

        const logistics1Bonus = state.completedResearch.includes('logistics1') ? 0.2 : 0;
        const advancedLogisticsBonus = state.completedResearch.includes('advancedLogistics') ? 0.3 : 0;
        const transportBonus = logistics1Bonus + advancedLogisticsBonus;

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
      },

      upgradeTransportLine: (id: string) => {
        const state = get();
        const line = state.transportLines.find(l => l.id === id);
        if (!line) return;

        const def = TRANSPORT_DEFS[line.type];
        const cost = Math.floor(def.baseCost.reduce((sum, c) => sum + (c.resource === 'money' ? c.amount : 0), 0) * Math.pow(1.3, line.level));
        if (state.money < cost) return;

        const logistics1Bonus = state.completedResearch.includes('logistics1') ? 0.2 : 0;
        const advancedLogisticsBonus = state.completedResearch.includes('advancedLogistics') ? 0.3 : 0;
        const transportBonus = logistics1Bonus + advancedLogisticsBonus;

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

        const marketBonus = state.completedResearch.includes('marketAnalysis') ? 0.2 : 0;
        const prestigeMarketBonus = state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'marketMultiplier').reduce((sum, b) => sum + b.effect.value, 0);
        const sellPrice = marketItem.currentPrice * amount * (0.9 + marketBonus + prestigeMarketBonus);

        set({
          resources: { ...state.resources, [resource]: state.resources[resource] - amount },
          money: state.money + sellPrice,
          totalMoneyEarned: state.totalMoneyEarned + sellPrice,
          stats: { ...state.stats, totalResourcesSold: { ...state.stats.totalResourcesSold, [resource]: state.stats.totalResourcesSold[resource] + amount } },
        });
        soundEngine.play('moneyEarned', 'production');
        get().addNotification('success', `Sold ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(sellPrice)}`);
        get().updateQuestProgress('sell', 1);
      },

      buyResource: (resource: ResourceType, amount: number) => {
        const state = get();
        const marketItem = state.market.find(m => m.resource === resource);
        if (!marketItem) return;

        const cost = marketItem.currentPrice * amount * 1.1;
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

        set({
          resources: { ...state.resources, [resource]: newAmount },
          money: state.money - cost,
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

        const pointsEarned = Math.floor(state.buildings.length * 0.5 + state.completedResearch.length * 2 + state.stats.contractsCompleted);

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

      importSave: (saveString: string) => {
        try {
          const json = decodeURIComponent(atob(saveString));
          const data = JSON.parse(json);

          // Validate structure has key fields
          if (
            typeof data.money !== 'number' ||
            typeof data.gameTick !== 'number' ||
            typeof data.resources !== 'object' ||
            !Array.isArray(data.buildings)
          ) {
            return false;
          }

          const state = get();
          set({
            money: typeof data.money === 'number' ? data.money : state.money,
            totalMoneyEarned: typeof data.totalMoneyEarned === 'number' ? data.totalMoneyEarned : state.totalMoneyEarned,
            gameTick: typeof data.gameTick === 'number' ? data.gameTick : state.gameTick,
            resources: data.resources && typeof data.resources === 'object' ? { ...state.resources, ...data.resources } : state.resources,
            resourceCapacity: data.resourceCapacity && typeof data.resourceCapacity === 'object' ? { ...state.resourceCapacity, ...data.resourceCapacity } : state.resourceCapacity,
            buildings: Array.isArray(data.buildings) ? data.buildings : state.buildings,
            transportLines: Array.isArray(data.transportLines) ? data.transportLines : state.transportLines,
            researchPoints: typeof data.researchPoints === 'number' ? data.researchPoints : state.researchPoints,
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

      updateQuestProgress: (type: string, amount: number) => {
        const state = get();
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
        const fuelCost = Math.ceil(mission.fuelCost / (1 + (drone.fuelEfficiencyLevel - 1) * 0.15));
        if (state.money < fuelCost) {
          soundEngine.play('error', 'building');
          get().addNotification('error', `Not enough money for fuel. Need $${formatNumber(fuelCost)}`);
          return;
        }

        // Calculate delivery time with speed upgrade
        const deliveryTicks = Math.max(10, Math.floor(mission.baseTicks / (1 + (drone.speedLevel - 1) * 0.2)));

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

      updateQuestProgress: (type: string, amount: number) => {
        const state = get();
        set({
          quests: state.quests.map(q => {
            if (q.completed || q.claimed) return q;
            if (q.type !== type) return q;
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
          totalCost += Math.floor(100 * Math.pow(1.5, currentLevel + i));
        }

        if (state.money < totalCost) {
          soundEngine.play('error', 'ui');
          get().addNotification('error', `Not enough money! Need $${formatNumber(totalCost)} to upgrade storage`);
          return;
        }

        const baseCapacity = initialCapacity[resource];
        const addedCapacity = baseCapacity * 0.5 * levels;
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

        // Calculate current production rates
        const offlineResources: Record<ResourceType, number> = { ...initialResources };
        let offlineMoney = 0;

        // Apply 50% offline rate
        const offlineRate = 0.5;

        // Offline production bonus from prestige
        const offlinePrestigeBonus = state.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'offlineMultiplier').reduce((sum, b) => sum + b.effect.value, 0);
        const effectiveOfflineRate = offlineRate * (1 + offlinePrestigeBonus);

        // Calculate production per tick for each building
        state.buildings.forEach(b => {
          if (!b.active) return;
          const def = BUILDING_DEFS[b.type];
          if (!def || !def.outputs) return;

          if (def.category === 'extractor') {
            def.outputs.forEach(output => {
              if (output.resource === 'money') return;
              const res = output.resource as ResourceType;
              const produced = output.amount * b.level * b.efficiency * effectiveOfflineRate * ticksElapsed;
              offlineResources[res] += produced;
            });
          }
        });

        // Apply capacity limits to offline resources
        (Object.keys(offlineResources) as ResourceType[]).forEach(r => {
          offlineResources[r] = Math.min(offlineResources[r], Math.max(0, getCapacity(state, r) - state.resources[r]));
        });

        // Calculate offline money from market sales (reduced rate)
        if (state.automationUnlocks.find(a => a.type === 'autoTrading' && a.active)) {
          (Object.keys(state.resources) as ResourceType[]).forEach(r => {
            const excess = state.resources[r] - getCapacity(state, r) * 0.5;
            if (excess > 0) {
              const marketPrice = state.market.find(m => m.resource === r)?.currentPrice ?? 0;
              const sellAmount = Math.min(excess, Math.floor(ticksElapsed * 0.1));
              offlineMoney += sellAmount * marketPrice * 0.7;
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
        const newResources = { ...state.resources };
        (Object.keys(offlineData.resources) as ResourceType[]).forEach(r => {
          newResources[r] = Math.min(getCapacity(state, r), newResources[r] + offlineData.resources[r]);
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
          emoji: currentRank.emoji,
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
        return Math.min(3, Math.max(highestBuildingTier, researchTier));
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
        get().addNotification('info', `Mega Project started: ${project.name}! Contribute resources to begin construction.`);
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
          get().addNotification('error', `Not enough resources for ${stage.name}!`);
          return;
        }

        // Deduct resources
        const newResources = { ...state.resources };
        let newMoney = state.money;
        stage.requiredResources.forEach(r => {
          if (r.resource === 'money') {
            newMoney -= r.amount;
          } else {
            newResources[r.resource as ResourceType] -= r.amount;
          }
        });

        // Mark stage resources as contributed (set progress to start ticking)
        const updatedStages = project.stages.map((s, i) =>
          i === project.currentStage ? { ...s } : s
        );

        set({
          money: newMoney,
          resources: newResources,
          megaProjects: state.megaProjects.map(p =>
            p.type === type
              ? {
                  ...p,
                  stages: updatedStages,
                  progress: Math.max(p.progress, 0.001), // Ensure progress starts
                }
              : p
          ),
        });
        get().addNotification('success', `Contributed resources to ${project.name}: ${stage.name}! Construction underway...`);
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

            const cost = getBuildingCost(bpBuilding.type, currentCount + i);
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
      version: 9,
      migrate: (persistedState: unknown) => {
        return migrateSaveState(persistedState as Record<string, unknown>);
      },
    }
  )
);

export { formatNumber, getBuildingCost, isBuildingUnlocked, isResearchUnlocked, generateId };

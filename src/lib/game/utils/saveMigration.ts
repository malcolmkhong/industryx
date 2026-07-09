// ============================================
// INDUSTRIAX: Save State Migration Utilities
// ============================================
//
// Extracted from store.ts for modularity.
// Contains:
//   - migrateSaveState: save version migration (V1→V20)
//   - generateDroneMissionsFromState: drone mission generation
// ============================================

import type {
  GameState,
  ResourceType,
  MarketPrice,
  DroneMission,
} from "../types";
import {
  BUILDING_DEFS,
  INITIAL_MARKET,
  INITIAL_MEGA_PROJECTS,
} from "../configCache";
import { migrateSaveBuildings } from "../idMigration";
import { emptyProductionSnapshot } from "../productionCalculator";
import { getBalance } from "../balanceConfig";
import { generateId } from "./generateId";
import { SAVE_VERSION } from "../constants/saveVersion";
import { initialResources } from "../constants/initialState";

// --- Drone Mission Generator ---
export function generateDroneMissionsFromState(
  state: GameState,
): DroneMission[] {
  const missions: DroneMission[] = [];
  const buildingTypes = [...new Set(state.buildings.map((b) => b.type))];

  if (buildingTypes.length < 2) return missions;

  // Generate missions from extractor → factory and factory → factory
  const extractors = buildingTypes.filter(
    (t) => BUILDING_DEFS[t]?.category === "extractor",
  );
  const factories = buildingTypes.filter(
    (t) => BUILDING_DEFS[t]?.category === "factory",
  );

  // Extractor to Factory missions
  extractors.forEach((from, i) => {
    const fromDef = BUILDING_DEFS[from];
    if (!fromDef) return;
    const targetFactories =
      factories.length > 0 ? factories : extractors.filter((t) => t !== from);
    targetFactories.forEach((to, j) => {
      const toDef = BUILDING_DEFS[to];
      if (!toDef) return;
      const difficulty =
        1 + i + j * getBalance().drone.difficultyPerFactoryPair;
      const moneyReward = Math.floor(
        200 * difficulty +
          state.buildings.filter((b) => b.type === from).length * 50,
      );
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
            resources:
              resourceReward && resourceReward !== "money"
                ? [
                    {
                      resource: resourceReward as ResourceType,
                      amount: Math.floor(3 * difficulty),
                    },
                  ]
                : undefined,
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
export function migrateSaveState(
  savedState: Record<string, unknown>,
  fromVersion?: number,
): Record<string, unknown> {
  const version = (savedState._version as number) || fromVersion || 1;
  let state = { ...savedState };

  // V1 → V2: Add megaProjects field and productionHistory
  if (version < 2) {
    if (!state.megaProjects) {
      state.megaProjects = INITIAL_MEGA_PROJECTS.map((p) => ({
        ...p,
        stages: p.stages.map((s) => ({ ...s })),
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
      (Object.keys(initialResources) as ResourceType[]).forEach((r) => {
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
        lastLoginDate: "",
        totalLogins: 0,
        weeklyRewards: [],
      };
    }
  }

  // V5 → V6: Add weather and quests
  if (version < 6) {
    if (!state.weather) {
      state.weather = {
        current: "clear",
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
        fleet: [
          {
            id: generateId(),
            status: "idle" as const,
            missionEndTick: 0,
            missionId: null,
            speedLevel: 1,
            capacityLevel: 1,
            fuelEfficiencyLevel: 1,
          },
        ],
        completedMissions: 0,
        totalEarned: 0,
      };
    }
  }

  // V9 → V10: Add new resources and their capacities/stats/market entries
  if (version < 10) {
    const newResources: Record<string, number> = {
      clay: 0,
      limestone: 0,
      gravel: 0,
      bauxite: 0,
      wolframite: 0,
      bricks: 0,
      concrete: 0,
      fertilizer: 0,
      fossilFuel: 0,
      silicon: 0,
      aluminium: 0,
      insecticide: 0,
      copperIngot: 0,
      titanium: 0,
      coolant: 0,
      fiberOptics: 0,
      solarCell: 0,
      electronics: 0,
      medicalTech: 0,
      jewellery: 0,
      tungsten: 0,
      weapons: 0,
      scanDrone: 0,
      artifactDetector: 0,
      neuralNetwork: 0,
    };
    const newCapacities: Record<string, number> = {
      clay: 500,
      limestone: 500,
      gravel: 500,
      bauxite: 200,
      wolframite: 100,
      bricks: 200,
      concrete: 200,
      fertilizer: 200,
      fossilFuel: 200,
      silicon: 100,
      aluminium: 100,
      insecticide: 100,
      copperIngot: 100,
      titanium: 100,
      coolant: 100,
      fiberOptics: 100,
      solarCell: 100,
      electronics: 50,
      medicalTech: 50,
      jewellery: 25,
      tungsten: 50,
      weapons: 50,
      scanDrone: 25,
      artifactDetector: 25,
      neuralNetwork: 25,
    };

    // Add missing resource keys
    if (state.resources && typeof state.resources === "object") {
      const resources = state.resources as Record<string, number>;
      Object.entries(newResources).forEach(([key, value]) => {
        if (resources[key] === undefined) {
          resources[key] = value;
        }
      });
      state.resources = resources;
    }

    // Add missing resourceCapacity keys
    if (state.resourceCapacity && typeof state.resourceCapacity === "object") {
      const cap = state.resourceCapacity as Record<string, number>;
      Object.entries(newCapacities).forEach(([key, value]) => {
        if (cap[key] === undefined) {
          cap[key] = value;
        }
      });
      state.resourceCapacity = cap;
    }

    // Add missing stats.totalResourcesProduced keys
    if (state.stats && typeof state.stats === "object") {
      const stats = state.stats as Record<string, unknown>;
      if (
        stats.totalResourcesProduced &&
        typeof stats.totalResourcesProduced === "object"
      ) {
        const produced = stats.totalResourcesProduced as Record<string, number>;
        Object.entries(newResources).forEach(([key, value]) => {
          if (produced[key] === undefined) {
            produced[key] = value;
          }
        });
        stats.totalResourcesProduced = produced;
      }
      if (
        stats.totalResourcesSold &&
        typeof stats.totalResourcesSold === "object"
      ) {
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
    if (
      state.storageUpgradeLevels &&
      typeof state.storageUpgradeLevels === "object"
    ) {
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
      const existingResources = new Set(
        (state.market as MarketPrice[]).map((m: MarketPrice) => m.resource),
      );
      const newMarketEntries: MarketPrice[] = [];
      INITIAL_MARKET.forEach((m) => {
        if (!existingResources.has(m.resource)) {
          newMarketEntries.push({ ...m });
        }
      });
      if (newMarketEntries.length > 0) {
        state.market = [
          ...(state.market as MarketPrice[]),
          ...newMarketEntries,
        ];
      }
    }
  }

  // V10 → V11: Add T4 resources
  if (version < 11) {
    const t4Resources = [
      "singularityCore",
      "darkMatterCell",
      "warpDrive",
      "antimatter",
      "chronoPart",
      "plasmaCore",
      "megaStructure",
      "voidCrystal",
    ];

    // Ensure T4 resources exist in resources object
    if (state.resources && typeof state.resources === "object") {
      for (const res of t4Resources) {
        if (!(res in (state.resources as Record<string, number>))) {
          (state.resources as Record<string, number>)[res] = 0;
        }
      }
    }

    // Ensure T4 resources exist in resourceCapacity
    if (state.resourceCapacity && typeof state.resourceCapacity === "object") {
      for (const res of t4Resources) {
        if (!(res in (state.resourceCapacity as Record<string, number>))) {
          (state.resourceCapacity as Record<string, number>)[res] = 50;
        }
      }
    }

    // Ensure T4 resources exist in storageUpgradeLevels
    if (
      state.storageUpgradeLevels &&
      typeof state.storageUpgradeLevels === "object"
    ) {
      for (const res of t4Resources) {
        if (!(res in (state.storageUpgradeLevels as Record<string, number>))) {
          (state.storageUpgradeLevels as Record<string, number>)[res] = 0;
        }
      }
    }

    // Ensure T4 resources exist in stats tracking
    if (state.stats) {
      const stats = state.stats as Record<string, unknown>;
      if (
        stats.totalResourcesProduced &&
        typeof stats.totalResourcesProduced === "object"
      ) {
        for (const res of t4Resources) {
          if (
            !(res in (stats.totalResourcesProduced as Record<string, number>))
          ) {
            (stats.totalResourcesProduced as Record<string, number>)[res] = 0;
          }
        }
      }
      if (
        stats.totalResourcesSold &&
        typeof stats.totalResourcesSold === "object"
      ) {
        for (const res of t4Resources) {
          if (!(res in (stats.totalResourcesSold as Record<string, number>))) {
            (stats.totalResourcesSold as Record<string, number>)[res] = 0;
          }
        }
      }
    }

    // Add missing market entries for T4 resources
    if (Array.isArray(state.market)) {
      const existingResources = new Set(
        (state.market as MarketPrice[]).map((m: MarketPrice) => m.resource),
      );
      const newMarketEntries: MarketPrice[] = [];
      INITIAL_MARKET.forEach((m) => {
        if (!existingResources.has(m.resource)) {
          newMarketEntries.push({ ...m });
        }
      });
      if (newMarketEntries.length > 0) {
        state.market = [
          ...(state.market as MarketPrice[]),
          ...newMarketEntries,
        ];
      }
    }
  }

  // V12 → V13: Phase 3 economy rebalance — comprehensive market price overhaul + endgame building fix
  if (version < 13) {
    // Complete market price rebalance for consistent margins across all tiers
    const priceUpdates: Record<string, number> = {
      // T1
      plastic: 30,
      fossilFuel: 40,
      // T2
      circuit: 150,
      engine: 300,
      battery: 140,
      silicon: 75,
      aluminium: 70,
      titanium: 300,
      solarCell: 150,
      // T3
      aiChip: 1200,
      robotics: 5000,
      quantumPart: 25000,
      nanoMaterial: 50000,
      electronics: 600,
      medicalTech: 1500,
      scanDrone: 5000,
      artifactDetector: 12000,
      neuralNetwork: 3500,
      // T4
      singularityCore: 150000,
      darkMatterCell: 160000,
      warpDrive: 180000,
      antimatter: 8000,
      chronoPart: 500000,
      plasmaCore: 8000,
      megaStructure: 5000,
      voidCrystal: 250000,
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
    const existingProjects = (state.megaProjects || []) as {
      type: string;
      active: boolean;
      completed: boolean;
      progress: number;
      currentStage: number;
      stages: { completed: boolean }[];
    }[];
    state.megaProjects = INITIAL_MEGA_PROJECTS.map((p) => {
      const existing = existingProjects.find((ep) => ep.type === p.type);
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
    (state as Record<string, unknown>).productionSnapshot =
      emptyProductionSnapshot();
  }

  // V15 → V16: Add sectorTrends (supply-demand market model)
  if (version < 16) {
    (state as Record<string, unknown>).sectorTrends = {};
  }

  // V16 → V17: Add marketNews + marketNarratives (MVIL + News + Narrative overlay layers)
  if (version < 17) {
    (state as Record<string, unknown>).marketNews = [];
    (state as Record<string, unknown>).marketNarratives = [];
  }

  // V17 → V18: Add lastTradeTick to marketSimState (trade freshness tracking)
  if (version < 18) {
    const simState = state.marketSimState as
      Record<string, unknown> | undefined;
    if (simState && !simState.lastTradeTick) {
      simState.lastTradeTick = {};
    }
  }

  // V17→V18+ Building ID migration (miningDrill→ironMine, quarry→sandMine, goldsmith→jewelleryForge)
  if (version < 18) {
    if (Array.isArray(state.buildings)) {
      state.buildings = migrateSaveBuildings(
        state.buildings as Array<{ type: string; [key: string]: unknown }>,
      );
    }
  }

  // V18 → V19: Add missing T2-T5 resources (silver, gold, powerCell, etc.)
  if (version < 19) {
    const newResourcesV19: Record<string, number> = {
      // T0
      silver: 0,
      gold: 0,
      // T2
      powerCell: 0,
      reinforcedConcrete: 0,
      refinedSilver: 0,
      refinedGold: 0,
      // T3
      carbonComposite: 0,
      structuralFrame: 0,
      fusionCell: 0,
      solarPanel: 0,
      creditChip: 0,
      // T4
      arcologyModule: 0,
      habitatModule: 0,
      stellarEnergy: 0,
      luxuryGoods: 0,
      tradeContract: 0,
      teleporterNode: 0,
      // T5
      researchMatrix: 0,
      worldCore: 0,
      shieldMatrix: 0,
      stellarForge: 0,
      voidEnergy: 0,
      marketDominance: 0,
      corpCapital: 0,
      dimensionalGate: 0,
      armadaFleet: 0,
    };
    const newCapacitiesV19: Record<string, number> = {
      silver: 100,
      gold: 100,
      powerCell: 100,
      reinforcedConcrete: 200,
      refinedSilver: 50,
      refinedGold: 50,
      carbonComposite: 25,
      structuralFrame: 25,
      fusionCell: 25,
      solarPanel: 50,
      creditChip: 25,
      arcologyModule: 25,
      habitatModule: 25,
      stellarEnergy: 25,
      luxuryGoods: 25,
      tradeContract: 25,
      teleporterNode: 25,
      researchMatrix: 10,
      worldCore: 10,
      shieldMatrix: 10,
      stellarForge: 10,
      voidEnergy: 10,
      marketDominance: 10,
      corpCapital: 10,
      dimensionalGate: 10,
      armadaFleet: 10,
    };

    if (state.resources && typeof state.resources === "object") {
      const resources = state.resources as Record<string, number>;
      Object.entries(newResourcesV19).forEach(([key, value]) => {
        if (resources[key] === undefined) resources[key] = value;
      });
    }
    if (state.resourceCapacity && typeof state.resourceCapacity === "object") {
      const cap = state.resourceCapacity as Record<string, number>;
      Object.entries(newCapacitiesV19).forEach(([key, value]) => {
        if (cap[key] === undefined) cap[key] = value;
      });
    }
    if (
      state.storageUpgradeLevels &&
      typeof state.storageUpgradeLevels === "object"
    ) {
      const upgrades = state.storageUpgradeLevels as Record<string, number>;
      Object.keys(newResourcesV19).forEach((key) => {
        if (upgrades[key] === undefined) upgrades[key] = 0;
      });
    }
    if (state.stats && typeof state.stats === "object") {
      const stats = state.stats as Record<string, unknown>;
      if (
        stats.totalResourcesProduced &&
        typeof stats.totalResourcesProduced === "object"
      ) {
        const produced = stats.totalResourcesProduced as Record<string, number>;
        Object.keys(newResourcesV19).forEach((key) => {
          if (produced[key] === undefined) produced[key] = 0;
        });
      }
      if (
        stats.totalResourcesSold &&
        typeof stats.totalResourcesSold === "object"
      ) {
        const sold = stats.totalResourcesSold as Record<string, number>;
        Object.keys(newResourcesV19).forEach((key) => {
          if (sold[key] === undefined) sold[key] = 0;
        });
      }
    }

    // Also add missing market entries for new resources
    if (Array.isArray(state.market)) {
      const existingResources = new Set(
        (state.market as MarketPrice[]).map((m: MarketPrice) => m.resource),
      );
      const newMarketEntries: MarketPrice[] = [];
      INITIAL_MARKET.forEach((m) => {
        if (!existingResources.has(m.resource)) {
          newMarketEntries.push({ ...m });
        }
      });
      if (newMarketEntries.length > 0) {
        state.market = [
          ...(state.market as MarketPrice[]),
          ...newMarketEntries,
        ];
      }
    }
  }

  // V19 → V20: Rename solarPanel power plant building to solarFarm (H5 naming collision)
  if (version < 20) {
    if (Array.isArray(state.buildings)) {
      const buildings = state.buildings as Array<{ type: string }>;
      buildings.forEach((b) => {
        if (b.type === "solarPanel") {
          b.type = "solarFarm";
        }
      });
    }
  }

  state._version = SAVE_VERSION;
  return state;
}

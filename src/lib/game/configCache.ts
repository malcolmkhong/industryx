// ============================================
// INDUSTRIAX: Dynamic Config Cache
// Bridges Supabase backend with frontend game code
// ============================================
//
// This module is the CRITICAL BRIDGE between Supabase and the frontend.
// It initializes with data.ts defaults (so the game works immediately)
// and can be updated when Supabase config loads via updateFromSupabase().
//
// All exports use `let` (not `const`) so ES module live bindings
// propagate updates to all importers automatically.
//
// Usage: Replace `import { X } from './data'` with `import { X } from './configCache'`
// and all existing code works unchanged, with the added benefit of
// receiving Supabase-driven updates at runtime.

import {
  BUILDING_DEFS as _DEFAULT_BUILDING_DEFS,
  RESOURCE_META as _DEFAULT_RESOURCE_META,
  RESEARCH_TREE as _DEFAULT_RESEARCH_TREE,
  TRANSPORT_DEFS as _DEFAULT_TRANSPORT_DEFS,
  WORKER_DEFS as _DEFAULT_WORKER_DEFS,
  INITIAL_MARKET as _DEFAULT_INITIAL_MARKET,
  AUTOMATION_UNLOCKS as _DEFAULT_AUTOMATION_UNLOCKS,
  PRESTIGE_BONUSES as _DEFAULT_PRESTIGE_BONUSES,
  EVENT_TEMPLATES as _DEFAULT_EVENT_TEMPLATES,
  TIER_INFO as _DEFAULT_TIER_INFO,
  CONTRACT_TEMPLATES as _DEFAULT_CONTRACT_TEMPLATES,
  RANK_THRESHOLDS as _DEFAULT_RANK_THRESHOLDS,
  PRODUCTION_CHAINS as _DEFAULT_PRODUCTION_CHAINS,
  INITIAL_MEGA_PROJECTS as _DEFAULT_INITIAL_MEGA_PROJECTS,
  WEEKLY_DAILY_REWARDS as _DEFAULT_WEEKLY_DAILY_REWARDS,
  SEASONAL_EVENTS as _DEFAULT_SEASONAL_EVENTS,
  WEATHER_DEFS as _DEFAULT_WEATHER_DEFS,
  QUEST_DEFS as _DEFAULT_QUEST_DEFS,
  getStreakMultiplier as _DEFAULT_getStreakMultiplier,
} from './data';
import { GameConfig } from './config';
import {
  BuildingDefinition,
  TransportDefinition,
  WorkerDefinition,
  ResearchNode,
  MarketPrice,
  AutomationUnlock,
  PrestigeBonus,
  ResourceType,
  MegaProject,
  DailyReward,
  WeatherType,
  WeatherDefinition,
  Quest,
} from './types';
import { migrateBuildingId } from './idMigration';

// ============================================
// Mutable references — importers see updates via live bindings
// ============================================

export let BUILDING_DEFS: Record<string, BuildingDefinition> = _DEFAULT_BUILDING_DEFS;
export let RESOURCE_META: Record<ResourceType, { name: string; icon: string; tier: number; color: string }> = _DEFAULT_RESOURCE_META;
export let RESEARCH_TREE: ResearchNode[] = _DEFAULT_RESEARCH_TREE;
export let TRANSPORT_DEFS: Record<string, TransportDefinition> = _DEFAULT_TRANSPORT_DEFS;
export let WORKER_DEFS: Record<string, WorkerDefinition> = _DEFAULT_WORKER_DEFS;
export let INITIAL_MARKET: MarketPrice[] = _DEFAULT_INITIAL_MARKET;
export let AUTOMATION_UNLOCKS: AutomationUnlock[] = _DEFAULT_AUTOMATION_UNLOCKS;
export let PRESTIGE_BONUSES: PrestigeBonus[] = _DEFAULT_PRESTIGE_BONUSES;
export let EVENT_TEMPLATES: typeof _DEFAULT_EVENT_TEMPLATES = _DEFAULT_EVENT_TEMPLATES;
export let TIER_INFO: Record<number, { name: string; icon: string; color: string; bgColor: string; borderColor: string; description: string }> = _DEFAULT_TIER_INFO;
export let CONTRACT_TEMPLATES: typeof _DEFAULT_CONTRACT_TEMPLATES = _DEFAULT_CONTRACT_TEMPLATES;
export let RANK_THRESHOLDS: typeof _DEFAULT_RANK_THRESHOLDS = _DEFAULT_RANK_THRESHOLDS;
export let PRODUCTION_CHAINS: typeof _DEFAULT_PRODUCTION_CHAINS = _DEFAULT_PRODUCTION_CHAINS;
export let INITIAL_MEGA_PROJECTS: MegaProject[] = _DEFAULT_INITIAL_MEGA_PROJECTS;
export let WEEKLY_DAILY_REWARDS: Omit<DailyReward, 'claimed'>[] = _DEFAULT_WEEKLY_DAILY_REWARDS;
export let SEASONAL_EVENTS: typeof _DEFAULT_SEASONAL_EVENTS = _DEFAULT_SEASONAL_EVENTS;
export let WEATHER_DEFS: Record<WeatherType, WeatherDefinition> = _DEFAULT_WEATHER_DEFS;
export let QUEST_DEFS: Quest[] = _DEFAULT_QUEST_DEFS;
export let getStreakMultiplier: (streak: number) => number = _DEFAULT_getStreakMultiplier;

// ============================================
// Migration map: old hardcoded ID → new Supabase ID
// ============================================

export const BUILDING_ID_MIGRATION: Record<string, string> = {
  miningDrill: 'ironMine',
  quarry: 'sandMine',       // quarry was a multi-resource extractor; Supabase splits into sandMine, lithiumMine
  goldsmith: 'jewelleryForge',
};

// ============================================
// Source tracking
// ============================================

export let configSource: 'local' | 'supabase' = 'local';
export let configLoadedAt: number = Date.now();
export let configVersion: number = 0;  // incremented on each update

// ============================================
// Update function — called by GameConfigProvider when Supabase data loads
// ============================================

export function updateFromSupabase(config: GameConfig): void {
  // --- Buildings ---
  if (config.buildings && Object.keys(config.buildings).length > 0) {
    // Merge: Supabase overrides defaults, but keep fallback for any missing entries
    const merged: Record<string, BuildingDefinition> = { ..._DEFAULT_BUILDING_DEFS };

    for (const [id, building] of Object.entries(config.buildings)) {
      // Apply migration: if Supabase provides a new ID that maps from an old one
      merged[id] = building;
    }

    BUILDING_DEFS = merged;
  }

  // --- Resources ---
  if (config.resources && Object.keys(config.resources).length > 0) {
    RESOURCE_META = {
      ...Object.fromEntries(
        Object.entries(_DEFAULT_RESOURCE_META).map(([key, val]) => [
          key,
          { name: val.name, icon: val.icon, tier: val.tier, color: val.color },
        ])
      ),
      ...Object.fromEntries(
        Object.entries(config.resources).map(([key, val]) => [
          key,
          { name: val.name, icon: val.icon, tier: val.tier, color: val.color },
        ])
      ),
    } as Record<ResourceType, { name: string; icon: string; tier: number; color: string }>;
  }

  // --- Research ---
  if (config.research && config.research.length > 0) {
    // GameConfig.research has a slightly different shape than ResearchNode[]
    // but they're close enough to cast through. The main difference is
    // effects format (GameConfig uses Record<string,unknown>[], ResearchNode uses ResearchEffect[])
    RESEARCH_TREE = config.research.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category as ResearchNode['category'],
      tier: r.tier,
      cost: r.cost,
      timeRequired: r.timeRequired,
      prerequisites: r.prerequisites,
      effects: r.effects as unknown as ResearchNode['effects'],
      icon: r.icon,
    }));
  }

  // --- Transport ---
  if (config.transport && config.transport.length > 0) {
    // Convert GameConfig transport array to Record keyed by id
    const transportRecord: Record<string, TransportDefinition> = { ..._DEFAULT_TRANSPORT_DEFS };
    for (const t of config.transport) {
      transportRecord[t.id] = {
        type: t.id as TransportDefinition['type'],
        name: t.name,
        description: t.description,
        baseCost: t.baseCost,
        baseThroughput: t.baseThroughput,
        upgradeMultiplier: t.upgradeMultiplier,
        icon: t.icon,
      };
    }
    TRANSPORT_DEFS = transportRecord;
  }

  // --- Workers ---
  if (config.workers && config.workers.length > 0) {
    const workerRecord: Record<string, WorkerDefinition> = { ..._DEFAULT_WORKER_DEFS };
    for (const w of config.workers) {
      workerRecord[w.id] = {
        type: w.id as WorkerDefinition['type'],
        name: w.name,
        description: w.description,
        baseHireCost: w.baseHireCost,
        effects: w.effects as WorkerDefinition['effects'],
        icon: w.icon,
      };
    }
    WORKER_DEFS = workerRecord;
  }

  // --- Market ---
  if (config.market && config.market.length > 0) {
    // Convert GameConfig market to full MarketPrice[] with defaults for missing fields
    INITIAL_MARKET = config.market.map(m => ({
      resource: m.resource as ResourceType,
      basePrice: m.basePrice,
      currentPrice: m.basePrice,
      priceHistory: [],
      demand: m.demand,
      supply: m.supply,
      trend: 'stable' as const,
      volatility: m.volatility,
    }));
  }

  // --- Automation ---
  if (config.automation && config.automation.length > 0) {
    AUTOMATION_UNLOCKS = config.automation.map(a => ({
      type: a.id as AutomationUnlock['type'],
      name: a.name,
      description: a.description,
      cost: a.cost,
      active: false,
      requiresResearch: a.requiresResearch ?? undefined,
      icon: a.icon,
    }));
  }

  // --- Prestige Bonuses ---
  if (config.prestigeBonuses && config.prestigeBonuses.length > 0) {
    PRESTIGE_BONUSES = config.prestigeBonuses.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      cost: p.cost,
      purchased: false,
      effect: p.effect as PrestigeBonus['effect'],
    }));
  }

  // --- Event Templates ---
  if (config.eventTemplates && config.eventTemplates.length > 0) {
    EVENT_TEMPLATES = config.eventTemplates.map(e => ({
      type: e.type,
      name: e.name,
      description: e.description,
      duration: e.duration,
      effects: e.effects,
      icon: e.icon,
    })) as unknown as typeof _DEFAULT_EVENT_TEMPLATES;
  }

  // --- Rank Thresholds ---
  if (config.rankThresholds && config.rankThresholds.length > 0) {
    RANK_THRESHOLDS = config.rankThresholds.map(r => ({
      name: r.name,
      minScore: r.scoreRequired,
      icon: 'gi:medal',
      color: '#a0a0a0',
    }));
  }

  // --- Quests ---
  if (config.quests && config.quests.length > 0) {
    QUEST_DEFS = config.quests.map(q => ({
      id: q.id,
      name: q.name,
      description: q.description,
      type: q.type as Quest['type'],
      category: q.category as Quest['category'],
      gameTier: q.gameTier,
      steps: q.steps as unknown as Quest['steps'],
      reward: q.reward as Quest['reward'],
      completed: false,
      claimed: false,
      icon: q.icon,
      targetResource: q.targetResource as ResourceType | undefined,
      targetBuilding: q.targetBuilding as Quest['targetBuilding'],
    }));
  }

  // --- Daily Rewards ---
  if (config.dailyRewards && config.dailyRewards.length > 0) {
    WEEKLY_DAILY_REWARDS = config.dailyRewards.map(d => ({
      day: d.day,
      type: d.type as DailyReward['type'],
      amount: d.amount,
      ...(d.resourceId ? { resource: d.resourceId as ResourceType } : {}),
    }));
  }

  // --- Seasonal Events ---
  if (config.seasonalEvents && config.seasonalEvents.length > 0) {
    SEASONAL_EVENTS = config.seasonalEvents.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      duration: 500, // default duration; Supabase may not have this
      effects: s.effects,
      color: '#a855f7', // default color
      triggerChance: 0.001, // default
    })) as unknown as typeof _DEFAULT_SEASONAL_EVENTS;
  }

  // --- Weather ---
  if (config.weather && Object.keys(config.weather).length > 0) {
    WEATHER_DEFS = {
      ..._DEFAULT_WEATHER_DEFS,
      ...Object.fromEntries(
        Object.entries(config.weather).map(([key, w]) => [key, {
          name: w.name,
          icon: w.icon,
          productionMultiplier: w.productionMultiplier,
          solarMultiplier: w.solarMultiplier,
          windMultiplier: w.windMultiplier,
          description: w.description,
        }])
      ),
    } as Record<WeatherType, WeatherDefinition>;
  }

  // --- Mega Projects ---
  if (config.megaProjects && config.megaProjects.length > 0) {
    INITIAL_MEGA_PROJECTS = config.megaProjects.map(m => ({
      type: m.id as MegaProject['type'],
      name: m.name,
      description: m.description,
      icon: m.icon,
      stages: m.stages as unknown as MegaProject['stages'],
      currentStage: 0,
      progress: 0,
      active: false,
      completed: false,
      bonus: m.bonus as unknown as MegaProject['bonus'],
      unlockRequirement: m.unlockRequirement as unknown as MegaProject['unlockRequirement'],
    }));
  }

  // --- Production Chains ---
  if (config.productionChains && config.productionChains.length > 0) {
    // Production chains from Supabase have a different format (upstream/downstream/resourceId)
    // We keep the default display-oriented chains and add Supabase data alongside
    // The Supabase chains are more about data relationships than visual display
    // For now, keep defaults unless Supabase provides display-oriented data
    PRODUCTION_CHAINS = _DEFAULT_PRODUCTION_CHAINS;
  }

  // --- Tier Info ---
  // Tier info is display-only and not in Supabase config; keep defaults
  // TIER_INFO remains _DEFAULT_TIER_INFO

  // --- Contract Templates ---
  // Contracts are generated at runtime from templates; not in Supabase config
  // CONTRACT_TEMPLATES remains _DEFAULT_CONTRACT_TEMPLATES

  // --- Streak Multiplier ---
  // This is a simple function; not in Supabase config
  // getStreakMultiplier remains _DEFAULT_getStreakMultiplier

  // --- Update source tracking ---
  configSource = 'supabase';
  configLoadedAt = Date.now();
  configVersion++;

  console.log(
    `[ConfigCache] Updated from Supabase (v${configVersion}): ` +
    `${Object.keys(BUILDING_DEFS).length} buildings, ` +
    `${Object.keys(RESOURCE_META).length} resources, ` +
    `${RESEARCH_TREE.length} research nodes`
  );
}

// ============================================
// Reset function — reverts to local data.ts defaults
// ============================================

export function resetToLocal(): void {
  BUILDING_DEFS = _DEFAULT_BUILDING_DEFS;
  RESOURCE_META = _DEFAULT_RESOURCE_META;
  RESEARCH_TREE = _DEFAULT_RESEARCH_TREE;
  TRANSPORT_DEFS = _DEFAULT_TRANSPORT_DEFS;
  WORKER_DEFS = _DEFAULT_WORKER_DEFS;
  INITIAL_MARKET = _DEFAULT_INITIAL_MARKET;
  AUTOMATION_UNLOCKS = _DEFAULT_AUTOMATION_UNLOCKS;
  PRESTIGE_BONUSES = _DEFAULT_PRESTIGE_BONUSES;
  EVENT_TEMPLATES = _DEFAULT_EVENT_TEMPLATES;
  TIER_INFO = _DEFAULT_TIER_INFO;
  CONTRACT_TEMPLATES = _DEFAULT_CONTRACT_TEMPLATES;
  RANK_THRESHOLDS = _DEFAULT_RANK_THRESHOLDS;
  PRODUCTION_CHAINS = _DEFAULT_PRODUCTION_CHAINS;
  INITIAL_MEGA_PROJECTS = _DEFAULT_INITIAL_MEGA_PROJECTS;
  WEEKLY_DAILY_REWARDS = _DEFAULT_WEEKLY_DAILY_REWARDS;
  SEASONAL_EVENTS = _DEFAULT_SEASONAL_EVENTS;
  WEATHER_DEFS = _DEFAULT_WEATHER_DEFS;
  QUEST_DEFS = _DEFAULT_QUEST_DEFS;
  getStreakMultiplier = _DEFAULT_getStreakMultiplier;

  configSource = 'local';
  configLoadedAt = Date.now();
  configVersion++;

  console.log('[ConfigCache] Reset to local defaults');
}

// ============================================
// Migration helper — migrate building type IDs in existing data
// ============================================

export function migrateBuildingDefs(): void {
  const migrated: Record<string, BuildingDefinition> = {};
  let migrationCount = 0;

  for (const [id, def] of Object.entries(BUILDING_DEFS)) {
    const newId = migrateBuildingId(id);
    if (newId !== id) {
      migrated[newId] = { ...def, type: newId as BuildingDefinition['type'] };
      migrationCount++;
    } else {
      migrated[id] = def;
    }
  }

  if (migrationCount > 0) {
    BUILDING_DEFS = migrated;
    console.log(`[ConfigCache] Migrated ${migrationCount} building IDs`);
  }
}

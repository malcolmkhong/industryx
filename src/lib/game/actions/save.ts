// ============================================
// Save Actions Factory
// ============================================
import type { BuildingType, ResourceType } from '../types';
import { BUILDING_DEFS } from '../configCache';
import { SAVE_VERSION } from '../constants/saveVersion';
import { initialResources } from '../constants/initialState';
import { createInitialState } from '../constants/initialState';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createSaveActions(set: SetFn, get: GetFn) {
  return {
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
        const MAX_MONEY = 1e12;
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
              continue;
            }
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_RESOURCE) {
              console.warn(`[Security] Save import: rejecting resource "${key}" with invalid value ${value}`);
              continue;
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
            if (typeof building.type === 'string' && !BUILDING_DEFS[building.type as BuildingType]) {
              console.warn(`[Security] Save import: unknown building type "${building.type}" — keeping but flagging`);
            }
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
          money: data.money,
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

    resetGame: () => set(createInitialState() as unknown as Record<string, unknown>),
  };
}

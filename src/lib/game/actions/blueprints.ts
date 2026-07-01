import type { BuildingType, TransportType, BuildingInstance, Blueprint } from '../types';
import { BUILDING_DEFS } from '../configCache';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { getBuildingCost, isBuildingUnlocked } from '../utils/costCalculator';
import { getMegaProjectBonus } from '../utils/gameMath';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createBlueprintActions(set: SetFn, get: GetFn) {
  return {
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

    // M8 FIX: Blueprint import validation — reject oversize, type-confusion,
    // and out-of-range count attacks
    importBlueprint: (code: string) => {
      const BLUEPRINT_MAX_BUILDINGS = 500;
      const BLUEPRINT_MAX_TRANSPORT = 200;
      const BLUEPRINT_MAX_COUNT_PER_TYPE = 1000;
      const VALID_TRANSPORT_TYPES = new Set<string>([
        'conveyorBelt', 'pipe', 'truck', 'cargoTrain', 'drone', 'cargoShip',
      ]);
      try {
        const json = decodeURIComponent(atob(code));
        const data = JSON.parse(json);

        if (!data.b || !Array.isArray(data.b) || !data.t || !Array.isArray(data.t)) {
          get().addNotification('error', 'Invalid blueprint code!');
          return false;
        }

        // M8 FIX: Bounds — reject oversize arrays before allocating
        if (data.b.length > BLUEPRINT_MAX_BUILDINGS) {
          get().addNotification('error', `Blueprint rejected: ${data.b.length} buildings exceeds limit of ${BLUEPRINT_MAX_BUILDINGS}`);
          return false;
        }
        if (data.t.length > BLUEPRINT_MAX_TRANSPORT) {
          get().addNotification('error', `Blueprint rejected: ${data.t.length} transport lines exceeds limit of ${BLUEPRINT_MAX_TRANSPORT}`);
          return false;
        }

        // M8 FIX: Validate each building — type must exist in BUILDING_DEFS, count must be finite and in [1, 1000]
        const validBuildings: { type: BuildingType; count: number }[] = [];
        for (const b of data.b) {
          if (typeof b !== 'object' || b === null) continue;
          const t = (b as { t?: unknown }).t;
          const c = (b as { c?: unknown }).c;
          if (typeof t !== 'string') continue;
          if (!Number.isFinite(c) || (c as number) < 1 || (c as number) > BLUEPRINT_MAX_COUNT_PER_TYPE) continue;
          if (!(t in BUILDING_DEFS)) {
            get().addNotification('warning', `Skipped unknown building type: ${t}`);
            continue;
          }
          validBuildings.push({ type: t as BuildingType, count: Math.floor(c as number) });
        }

        // M8 FIX: Validate each transport — same hardening
        const validTransport: { type: TransportType; count: number }[] = [];
        for (const t of data.t) {
          if (typeof t !== 'object' || t === null) continue;
          const typeStr = (t as { t?: unknown }).t;
          const c = (t as { c?: unknown }).c;
          if (typeof typeStr !== 'string') continue;
          if (!Number.isFinite(c) || (c as number) < 1 || (c as number) > BLUEPRINT_MAX_COUNT_PER_TYPE) continue;
          if (!VALID_TRANSPORT_TYPES.has(typeStr)) {
            get().addNotification('warning', `Skipped unknown transport type: ${typeStr}`);
            continue;
          }
          validTransport.push({ type: typeStr as TransportType, count: Math.floor(c as number) });
        }

        if (validBuildings.length === 0 && validTransport.length === 0) {
          get().addNotification('error', 'Blueprint contained no valid entries!');
          return false;
        }

        const blueprint: Blueprint = {
          id: generateId(),
          name: data.n || `Imported Layout`,
          buildings: validBuildings,
          transportLines: validTransport,
          savedAt: Date.now(),
          shared: true,
          likes: 0,
        };

        const state = get();
        set({ blueprints: [blueprint, ...state.blueprints] });
        get().addNotification('success', `Blueprint imported: ${blueprint.name} (${validBuildings.length} buildings, ${validTransport.length} transport)`);
        return true;
      } catch {
        get().addNotification('error', 'Invalid blueprint code!');
        return false;
      }
    },
  };
}

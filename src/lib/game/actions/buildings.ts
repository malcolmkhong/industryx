import type { BuildingType, BuildingInstance } from '../types';
import { BUILDING_DEFS } from '../configCache';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { getBuildingCost, isBuildingUnlocked } from '../utils/costCalculator';
import { getMegaProjectBonus } from '../utils/gameMath';
import { getBalance } from '../balanceConfig';
import { soundEngine } from '../soundEngine';
import { buildMultipliers, computePowerGrid } from '../productionCalculator';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createBuildingActions(set: SetFn, get: GetFn) {
  return {
    buildBuilding: async (type: BuildingType) => {
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

      // Phase 2.3: BLOCKING. See actionValidator.ts.
      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('build', { buildingType: type }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', validation.error ?? `Building ${def.name} rejected by server`);
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

    toggleBuilding: async (id: string) => {
      const state = get();
      const building = state.buildings.find(b => b.id === id);
      if (!building) return;
      const def = BUILDING_DEFS[building.type];
      const newActive = !building.active;
      const newBuildings = state.buildings.map(b =>
        b.id === id ? { ...b, active: newActive } : b
      );

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('toggle_building', { buildingId: id, enabled: newActive }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', validation.error ?? 'Building toggle rejected by server');
        return;
      }

      // Recalculate power grid immediately so UI updates without waiting for next tick
      // Uses productionCalculator's computePowerGrid for consistency with gameTick
      const tempState = { ...state, buildings: newBuildings };
      const cache = buildMultipliers(tempState);
      const tempResources = { ...state.resources };
      const powerResult = computePowerGrid(tempState, cache, tempResources, state.gameTick);

      // Play sound for power toggle
      if (def?.category === 'power') {
        soundEngine.play(newActive ? 'buildingPlaced' : 'powerOverload', 'events');
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
  };
}

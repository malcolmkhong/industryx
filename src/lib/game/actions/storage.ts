// ============================================
// Storage Actions Factory
// ============================================
import type { ResourceType } from '../types';
import { RESOURCE_META } from '../configCache';
import { getBalance } from '../balanceConfig';
import { initialCapacity } from '../constants/initialState';
import { formatNumber } from '../utils/formatNumber';
import { soundEngine } from '../soundEngine';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createStorageActions(set: SetFn, get: GetFn) {
  return {
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
  };
}

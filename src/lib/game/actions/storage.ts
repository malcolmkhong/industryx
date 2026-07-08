// ============================================
// Storage Actions Factory
// ============================================
import type { ResourceType } from "../types";
import { RESOURCE_META } from "../configCache";
import { getBalance } from "../balanceConfig";
import { initialCapacity } from "../constants/initialState";
import { formatNumber } from "../utils/formatNumber";
import { soundEngine } from "../soundEngine";

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

export function createStorageActions(set: SetFn, get: GetFn) {
  return {
    upgradeStorage: (resource: ResourceType, levels: number) => {
      const state = get();
      const currentLevel = state.storageUpgradeLevels[resource] ?? 0;
      // Phase 3 C1: log-dampening formula. Effective cost = 100 * exponent^N * dampener^N
      // where dampener = logCostMultiplier (default 0.9). This caps runaway growth
      // at high levels while preserving early-game progression feel.
      const bal = getBalance().storage;
      let totalCost = 0;
      for (let i = 0; i < levels; i++) {
        const n = currentLevel + i;
        const exponential = Math.pow(bal.upgradeCostExponent, n);
        const dampening = Math.pow(bal.logCostMultiplier, n);
        totalCost += Math.floor(100 * exponential * dampening);
      }

      if (state.money < totalCost) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          `Not enough money! Need $${formatNumber(totalCost)} to upgrade storage`,
        );
        return;
      }

      const baseCapacity = initialCapacity[resource];
      const addedCapacity =
        baseCapacity * getBalance().storage.upgradeCapacityRatio * levels;
      const newCapacity = {
        ...state.resourceCapacity,
        [resource]: state.resourceCapacity[resource] + addedCapacity,
      };
      const newUpgradeLevels = {
        ...state.storageUpgradeLevels,
        [resource]: currentLevel + levels,
      };

      set({
        money: state.money - totalCost,
        resourceCapacity: newCapacity,
        storageUpgradeLevels: newUpgradeLevels,
      });
      soundEngine.play("buildingPlaced", "building");
      get().addNotification(
        "success",
        `Upgraded ${RESOURCE_META[resource].name} storage to +${Math.floor(addedCapacity)} capacity`,
      );
    },
  };
}

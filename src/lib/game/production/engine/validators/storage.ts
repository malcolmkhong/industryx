// Server-authoritative storage upgrade validator.

import { applyUpgradeStorageMutation } from "../mutators/storage";
import { getBalance } from "../../../config/balance/balanceConfig";
import type {
  ResourceType,
  ServerGameData,
} from "../../../shared/types/types";

export function validateUpgradeStorageAction(
  resource: string,
  levels: number,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  // Input validation
  if (!resource || typeof resource !== "string") {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!Number.isFinite(levels) || levels <= 0 || !Number.isInteger(levels)) {
    return {
      valid: false,
      error: `Invalid levels: ${levels}. Must be a positive integer.`,
    };
  }
  // Phase 2.5: cap bulk upgrades server-side, tuned via balance config
  // (was hardcoded `MAX_STORAGE_UPGRADE = 100`; V-030 moved it to
  // `game_config_balance.storage.maxBulkUpgradeLevels`, migration 078).
  const { maxBulkUpgradeLevels } = getBalance().storage;
  if (levels > maxBulkUpgradeLevels) {
    return {
      valid: false,
      error: `Cannot upgrade more than ${maxBulkUpgradeLevels} levels at once`,
    };
  }

  // Cost formula: matches client upgradeStorage.
  const bal = getBalance().storage;
  const currentLevel =
    state.storageUpgradeLevels?.[resource as ResourceType] ?? 0;

  let totalCost = 0;
  for (let i = 0; i < levels; i++) {
    const n = currentLevel + i;
    const exponential = Math.pow(bal.upgradeCostExponent, n);
    const dampening = Math.pow(bal.logCostMultiplier, n);
    totalCost += Math.floor(100 * exponential * dampening);
  }

  const money = state.money ?? 0;
  if (money < totalCost) {
    return {
      valid: false,
      error: `Not enough money for storage upgrade. Need $${totalCost}, have $${Math.floor(money)}`,
    };
  }

  // Capacity gain: base capacity * upgradeCapacityRatio * levels
  const baseCapacity = state.resourceCapacity?.[resource as ResourceType] ?? 0;
  const addedCapacity = baseCapacity * bal.upgradeCapacityRatio * levels;
  const nextCapacity = {
    ...(state.resourceCapacity ?? ({} as Record<ResourceType, number>)),
    [resource]: baseCapacity + addedCapacity,
  };
  const nextLevels = {
    ...(state.storageUpgradeLevels ?? ({} as Record<ResourceType, number>)),
    [resource]: currentLevel + levels,
  };

  return {
    valid: true,
    correctedState: applyUpgradeStorageMutation(
      { totalCost, nextCapacity, nextLevels },
      state,
    ),
  };
}
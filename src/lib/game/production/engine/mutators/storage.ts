// Server-authoritative storage upgrade mutation.
//
// Assumes validator verified: resource type + positive integer levels ≤ 100,
// total cost affordable.

import type {
  ResourceType,
  ServerGameData,
} from "../../../shared/types/types";

export interface UpgradeStorageMutationInput {
  totalCost: number;
  nextCapacity: Record<ResourceType, number>;
  nextLevels: Record<ResourceType, number>;
}

export function applyUpgradeStorageMutation(
  input: UpgradeStorageMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { totalCost, nextCapacity, nextLevels } = input;
  const money = state.money ?? 0;

  return {
    money: money - totalCost,
    resourceCapacity: nextCapacity,
    storageUpgradeLevels: nextLevels,
  };
}
// Server-authoritative build mutation.
//
// Given a validated building type + already-validated scaled costs, computes
// the post-build corrected state: appends a new BuildingInstance, deducts
// money + non-money resources. Assumes the validator has already verified
// research/prestige unlocks and affordability.

import { generateBuildingId } from "../ids";
import type {
  BuildingInstance,
  ResourceType,
  ServerGameData,
} from "../../../shared/types/types";

export interface BuildMutationInput {
  buildingType: string;
  scaledCosts: Array<{ resource: string; amount: number }>;
}

export function applyBuildMutation(
  input: BuildMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { buildingType, scaledCosts } = input;

  const money = state.money ?? 0;
  const resources = state.resources ?? {};

  const newBuilding = {
    id: generateBuildingId(),
    type: buildingType,
    level: 1,
    active: true,
    efficiency: 1,
    placedAt: Number(state.gameTick) || 0,
  } as const;

  const nextBuildings = [...(state.buildings ?? []), newBuilding];
  const nextMoney =
    money - (scaledCosts.find((c) => c.resource === "money")?.amount ?? 0);
  const nextResources = { ...resources };
  for (const c of scaledCosts) {
    if (c.resource !== "money") {
      const current = nextResources[c.resource as ResourceType] ?? 0;
      nextResources[c.resource as ResourceType] = current - c.amount;
    }
  }

  return {
    buildings: nextBuildings as unknown as BuildingInstance[],
    money: nextMoney,
    resources: nextResources as unknown as Record<ResourceType, number>,
  };
}
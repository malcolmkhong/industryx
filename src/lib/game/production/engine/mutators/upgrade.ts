// Server-authoritative building upgrade mutation.
//
// Assumes validator verified: building exists, upgrade cost is affordable.
// Mutator increments level + bumps efficiency cap, deducts scaled costs.

import type {
  BuildingInstance,
  ResourceType,
  ServerGameData,
} from "../../../shared/types/types";

export interface UpgradeMutationInput {
  buildingIdx: number;
  scaledCosts: Array<{ resource: string; amount: number }>;
}

export function applyUpgradeMutation(
  input: UpgradeMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { buildingIdx, scaledCosts } = input;
  const buildings = state.buildings ?? [];
  const building = buildings[buildingIdx];

  const upgradedBuilding = {
    ...building,
    level: building.level + 1,
    efficiency: Math.min(2, building.efficiency + 0.1),
  };
  const nextBuildings = buildings.map((b, i) =>
    i === buildingIdx ? upgradedBuilding : b,
  );

  const money = state.money ?? 0;
  const resources = state.resources ?? {};

  const nextMoney =
    money - (scaledCosts.find((c) => c.resource === "money")?.amount ?? 0);
  const nextResources: Record<string, number> = { ...resources };
  for (const c of scaledCosts) {
    if (c.resource !== "money") {
      const current = nextResources[c.resource as ResourceType] ?? 0;
      nextResources[c.resource as ResourceType] = current - c.amount;
    }
  }

  return {
    buildings: nextBuildings as unknown as BuildingInstance[],
    money: nextMoney,
    resources: nextResources,
  };
}
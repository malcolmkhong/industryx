// Server-authoritative building upgrade validator.

import { applyUpgradeMutation } from "../mutators/upgrade";
import type { GameConfig } from "../../../config/config";
import type { ResourceType, ServerGameData } from "../../../shared/types/types";

export function validateUpgradeAction(
  buildingId: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  const buildings = state.buildings ?? [];
  const buildingIdx = buildings.findIndex((b) => b.id === buildingId);
  if (buildingIdx < 0) {
    return {
      valid: false,
      error: `Building instance "${buildingId}" not found`,
    };
  }
  const building = buildings[buildingIdx];

  const buildingDef = config.buildings[building.type];
  if (!buildingDef) {
    return {
      valid: false,
      error: `Building type "${building.type}" not found in game config`,
    };
  }

  // Compute authoritative scaled cost.
  const megaBuildingCostReduction =
    state.megaProjects?.find(
      (p) => p.completed && p.bonus?.type === "buildingCostReduction",
    )?.bonus?.value ?? 0;

  const upgradeCost = buildingDef.baseCost.map((c) => {
    if (c.resource === "money") {
      const scaled = Math.floor(
        c.amount * Math.pow(buildingDef.costMultiplier, building.level),
      );
      return {
        resource: c.resource,
        amount: Math.max(
          1,
          Math.floor(scaled * (1 - megaBuildingCostReduction)),
        ),
      };
    }
    return {
      resource: c.resource,
      amount: Math.ceil(
        c.amount * Math.pow(buildingDef.costMultiplier, building.level),
      ),
    };
  });

  // Check affordability (use SCALED cost, not base).
  const money = state.money ?? 0;
  const resources = state.resources ?? {};
  for (const cost of upgradeCost) {
    if (cost.resource === "money") {
      if (money < cost.amount) {
        return {
          valid: false,
          error: `Not enough money for upgrade. Need $${cost.amount}, have $${Math.floor(money)}`,
        };
      }
    } else {
      const available = resources[cost.resource as ResourceType] ?? 0;
      if (available < cost.amount) {
        return {
          valid: false,
          error: `Not enough ${cost.resource} for upgrade. Need ${cost.amount}, have ${Math.floor(available)}`,
        };
      }
    }
  }

  return {
    valid: true,
    correctedState: applyUpgradeMutation(
      { buildingIdx, scaledCosts: upgradeCost },
      state,
    ),
  };
}
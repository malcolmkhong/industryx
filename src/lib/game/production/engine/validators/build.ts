// Server-authoritative build action validator.
//
// Validates building type existence, research/prestige unlocks, and
// affordability (using scaled costs with mega-project discount). Delegates
// state mutation to applyBuildMutation.

import { applyBuildMutation } from "../mutators/build";
import type { GameConfig } from "../../../config/config";
import type { ResourceType, ServerGameData } from "../../../shared/types/types";

export function validateBuildAction(
  buildingType: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  const buildingDef = config.buildings[buildingType];
  if (!buildingDef) {
    return {
      valid: false,
      error: `Building type "${buildingType}" not found in game config`,
    };
  }

  // Check research unlock
  if (buildingDef.unlockRequirement?.research) {
    const completedResearch = state.completedResearch ?? [];
    if (!completedResearch.includes(buildingDef.unlockRequirement.research)) {
      return {
        valid: false,
        error: `Research "${buildingDef.unlockRequirement.research}" required to build ${buildingDef.name}`,
      };
    }
  }

  // Check prestige unlock
  if (buildingDef.unlockRequirement?.prestige) {
    const totalPrestiges = state.prestigeState?.totalPrestiges ?? 0;
    if (totalPrestiges < buildingDef.unlockRequirement.prestige) {
      return {
        valid: false,
        error: `Prestige level ${buildingDef.unlockRequirement.prestige} required to build ${buildingDef.name}`,
      };
    }
  }

  // Compute authoritative scaled cost (base * costMultiplier ^ currentCount).
  const existingBuildings = (state.buildings ?? []).filter(
    (b) => b.type === buildingType,
  );
  const currentCount = existingBuildings.length;

  const megaBuildingCostReduction =
    state.megaProjects?.find(
      (p) => p.completed && p.bonus?.type === "buildingCostReduction",
    )?.bonus?.value ?? 0;

  const scaledCosts = buildingDef.baseCost.map((c) => {
    if (c.resource === "money") {
      const scaled = Math.floor(
        c.amount * Math.pow(buildingDef.costMultiplier, currentCount),
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
        c.amount * Math.pow(buildingDef.costMultiplier, currentCount),
      ),
    };
  });

  // Affordability check (uses scaled cost).
  const money = state.money ?? 0;
  const resources = state.resources ?? {};
  for (const cost of scaledCosts) {
    if (cost.resource === "money") {
      if (money < cost.amount) {
        return {
          valid: false,
          error: `Not enough money. Need $${cost.amount}, have $${Math.floor(money)}`,
        };
      }
    } else {
      const available = resources[cost.resource as ResourceType] ?? 0;
      if (available < cost.amount) {
        return {
          valid: false,
          error: `Not enough ${cost.resource}. Need ${cost.amount}, have ${Math.floor(available)}`,
        };
      }
    }
  }

  return {
    valid: true,
    correctedState: applyBuildMutation(
      { buildingType, scaledCosts },
      state,
    ),
  };
}
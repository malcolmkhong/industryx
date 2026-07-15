// ============================================
// droneMissionGenerator.ts
//
// Pure drone mission generation from current game state. Extracted
// from saveMigration.ts for responsibility isolation.
// ============================================

import type { GameState, ResourceType, DroneMission } from "../../types/types";
import { BUILDING_DEFS } from "../../../config/configCache";
import { getBalance } from "../../../config/balance/balanceConfig";

// --- Drone Mission Generator ---
export function generateDroneMissionsFromState(
  state: GameState,
): DroneMission[] {
  const missions: DroneMission[] = [];
  const buildingTypes = [...new Set(state.buildings.map((b) => b.type))];

  if (buildingTypes.length < 2) return missions;

  // Generate missions from extractor → factory and factory → factory
  const extractors = buildingTypes.filter(
    (t) => BUILDING_DEFS[t]?.category === "extractor",
  );
  const factories = buildingTypes.filter(
    (t) => BUILDING_DEFS[t]?.category === "factory",
  );

  // Extractor to Factory missions
  extractors.forEach((from, i) => {
    const fromDef = BUILDING_DEFS[from];
    if (!fromDef) return;
    const targetFactories =
      factories.length > 0 ? factories : extractors.filter((t) => t !== from);
    targetFactories.forEach((to, j) => {
      const toDef = BUILDING_DEFS[to];
      if (!toDef) return;
      const difficulty =
        1 + i + j * getBalance().drone.difficultyPerFactoryPair;
      const moneyReward = Math.floor(
        200 * difficulty +
          state.buildings.filter((b) => b.type === from).length * 50,
      );
      const rpReward = Math.floor(5 * difficulty);
      missions.push({
        id: `drone-mission-${from}-${to}`,
        fromBuilding: fromDef.name,
        toBuilding: toDef.name,
        reward: { money: moneyReward, researchPoints: rpReward },
        fuelCost: Math.floor(50 + difficulty * 30),
        baseTicks: Math.floor(60 + difficulty * 40),
      });
    });
  });

  // Factory to Factory missions (higher tier)
  if (factories.length >= 2) {
    for (let i = 0; i < factories.length; i++) {
      for (let j = i + 1; j < factories.length; j++) {
        const fromDef = BUILDING_DEFS[factories[i]];
        const toDef = BUILDING_DEFS[factories[j]];
        if (!fromDef || !toDef) continue;
        const difficulty = 2 + fromDef.tier + toDef.tier;
        const moneyReward = Math.floor(500 * difficulty);
        const rpReward = Math.floor(10 * difficulty);
        const resourceReward = fromDef.outputs?.[0]?.resource;
        missions.push({
          id: `drone-mission-${factories[i]}-${factories[j]}`,
          fromBuilding: fromDef.name,
          toBuilding: toDef.name,
          reward: {
            money: moneyReward,
            researchPoints: rpReward,
            resources:
              resourceReward && resourceReward !== "money"
                ? [
                    {
                      resource: resourceReward as ResourceType,
                      amount: Math.floor(3 * difficulty),
                    },
                  ]
                : undefined,
          },
          fuelCost: Math.floor(100 + difficulty * 40),
          baseTicks: Math.floor(80 + difficulty * 50),
        });
      }
    }
  }

  return missions.slice(0, 8); // Max 8 missions at a time
}
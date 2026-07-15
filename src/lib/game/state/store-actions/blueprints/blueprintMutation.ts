// ============================================
// blueprintMutation.ts
//
// Client-side blueprint mutation actions. Orchestrates:
//   • blueprintSerialization  — encode/decode share codes
//   • blueprintValidation     — bounds + type checks
//   • blueprintUiEffects      — notifications
//
// State shape updates only happen here. Each UI side-effect is
// delegated to the injected `effects` interface so the mutation logic
// stays testable in isolation.
// ============================================

import type {
  Blueprint,
  BuildingInstance,
  BuildingType,
  TransportType,
} from "../../../shared/types/types";
import { BUILDING_DEFS } from "../../../config/configCache";
import { generateId } from "../../../shared/utils/generateId";
import {
  getBuildingCost,
  isBuildingUnlocked,
} from "../../../shared/utils/costCalculator";
import { getMegaProjectBonus } from "../../../shared/utils/gameMath";
import type { SetFn, GetFn } from "../_actionTypes";
import {
  deserializeBlueprint,
  serializeBlueprint,
} from "./blueprintSerialization";
import { validateBlueprint } from "./blueprintValidation";
import type { BlueprintUiEffects } from "./blueprintUiEffects";

export function createBlueprintMutationActions(
  set: SetFn,
  get: GetFn,
  effects: BlueprintUiEffects,
) {
  return {
    saveBlueprint: (name: string) => {
      const state = get();

      const buildingCounts: Record<string, number> = {};
      state.buildings.forEach((b) => {
        buildingCounts[b.type] = (buildingCounts[b.type] || 0) + 1;
      });
      const buildings = Object.entries(buildingCounts).map(([type, count]) => ({
        type: type as BuildingType,
        count,
      }));

      const transportCounts: Record<string, number> = {};
      state.transportLines.forEach((t) => {
        transportCounts[t.type] = (transportCounts[t.type] || 0) + 1;
      });
      const transportLines = Object.entries(transportCounts).map(
        ([type, count]) => ({
          type: type as TransportType,
          count,
        }),
      );

      const blueprint: Blueprint = {
        id: generateId(),
        name,
        buildings,
        transportLines,
        savedAt: Date.now(),
        shared: false,
        likes: 0,
      };

      set({ blueprints: [blueprint, ...state.blueprints] });
      effects.notifySaved(name);
    },

    loadBlueprint: (id: string) => {
      const state = get();
      const blueprint = state.blueprints.find((bp) => bp.id === id);
      if (!blueprint) {
        effects.notifyBlueprintNotFound();
        return;
      }

      let builtCount = 0;
      let skippedCount = 0;
      blueprint.buildings.forEach((bpBuilding) => {
        const currentCount = state.buildings.filter(
          (b) => b.type === bpBuilding.type,
        ).length;
        const needed = bpBuilding.count - currentCount;

        for (let i = 0; i < needed; i++) {
          const def = BUILDING_DEFS[bpBuilding.type];
          if (!def) {
            skippedCount++;
            continue;
          }

          const cost = getBuildingCost(
            bpBuilding.type,
            currentCount + i,
            getMegaProjectBonus(state.megaProjects, "buildingCostReduction"),
          );
          if (state.money < cost) {
            skippedCount++;
            continue;
          }

          if (
            !isBuildingUnlocked(
              bpBuilding.type,
              state.completedResearch,
              state.prestigeState,
            )
          ) {
            skippedCount++;
            continue;
          }

          const building: BuildingInstance = {
            id: generateId(),
            type: bpBuilding.type,
            level: 1,
            active: true,
            efficiency: 1,
            placedAt: state.gameTick,
          };

          state.money -= cost;
          state.buildings = [...state.buildings, building];
          state.stats = {
            ...state.stats,
            factoriesBuilt: state.stats.factoriesBuilt + 1,
          };
          builtCount++;
        }
      });

      set({
        money: state.money,
        buildings: state.buildings,
        stats: state.stats,
      });

      effects.notifyLoaded(blueprint.name, builtCount, skippedCount);
    },

    deleteBlueprint: (id: string) => {
      const state = get();
      set({ blueprints: state.blueprints.filter((bp) => bp.id !== id) });
      effects.notifyDeleted();
    },

    renameBlueprint: (id: string, name: string) => {
      const state = get();
      set({
        blueprints: state.blueprints.map((bp) =>
          bp.id === id ? { ...bp, name } : bp,
        ),
      });
    },

    exportBlueprint: (id: string) => {
      const state = get();
      const blueprint = state.blueprints.find((bp) => bp.id === id);
      if (!blueprint) return "";
      return serializeBlueprint(blueprint);
    },

    // M8 FIX: Blueprint import — orchestrates deserialize → validate,
    // dispatching the correct notification per failure reason.
    importBlueprint: (code: string) => {
      const decoded = deserializeBlueprint(code);
      if (!decoded) {
        effects.notifyInvalidCode();
        return false;
      }

      const result = validateBlueprint(decoded);
      if (!result.ok) {
        switch (result.reason) {
          case "oversizeBuildings":
            effects.notifyOversizeBuildings(result.count, result.limit);
            break;
          case "oversizeTransport":
            effects.notifyOversizeTransport(result.count, result.limit);
            break;
          case "empty":
            effects.notifyEmptyBlueprint();
            break;
          case "structure":
            effects.notifyInvalidCode();
            break;
        }
        return false;
      }

      const v = result.blueprint;
      v.warnings.forEach((warning) => {
        effects.notifyValidationWarning(warning);
      });

      const blueprint: Blueprint = {
        id: generateId(),
        name: v.name,
        buildings: v.validBuildings,
        transportLines: v.validTransport,
        savedAt: Date.now(),
        shared: v.shared,
        likes: 0,
      };

      const state = get();
      set({ blueprints: [blueprint, ...state.blueprints] });
      effects.notifyImported(
        blueprint.name,
        v.validBuildings.length,
        v.validTransport.length,
      );
      return true;
    },
  };
}

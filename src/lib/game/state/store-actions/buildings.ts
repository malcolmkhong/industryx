import type { BuildingType, BuildingInstance } from "../../shared/types/types";
import { BUILDING_DEFS } from "../../config/configCache";
import { generateId } from "../../shared/utils/generateId";
import { formatNumber } from "../../shared/utils/formatNumber";
import { getBuildingCost, isBuildingUnlocked } from "../../shared/utils/costCalculator";
import { getMegaProjectBonus } from "../../shared/utils/gameMath";
import { soundEngine } from "../../audio/soundEngine";
import { buildMultipliers, computePowerGrid } from "../../production/productionCalculator";
import type { SetFn, GetFn } from "./_actionTypes";

export function createBuildingActions(set: SetFn, get: GetFn) {
  return {
    buildBuilding: async (type: BuildingType) => {
      const state = get();
      const def = BUILDING_DEFS[type];
      if (!def) return;

      if (
        !isBuildingUnlocked(type, state.completedResearch, state.prestigeState)
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          `${def.name} is locked! Complete required research first.`,
        );
        return;
      }

      const currentCount = state.buildings.filter(
        (b) => b.type === type,
      ).length;
      const megaBuildingCostReduction = getMegaProjectBonus(
        state.megaProjects,
        "buildingCostReduction",
      );
      const cost = getBuildingCost(
        type,
        currentCount,
        megaBuildingCostReduction,
      );

      if (state.money < cost) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          `Not enough money! Need $${formatNumber(cost)}`,
        );
        return;
      }

      // Phase 2.3: BLOCKING. Server must return correctedState; no local
      // fallback mutation is allowed when server authority is unavailable.
      const validation = await import("../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer(
          "build",
          { buildingType: type },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? `Building ${def.name} rejected by server`,
        );
        return;
      }

      // First building
      if (state.buildings.length === 0) {
        soundEngine.play("levelUp", "events");
      }

      const corrected = validation.correctedState;
      const serverBuildings = corrected?.buildings;
      const serverMoney = corrected?.money;
      if (!Array.isArray(serverBuildings) || typeof serverMoney !== "number") {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Build could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        money: serverMoney,
        buildings: serverBuildings as BuildingInstance[],
        stats: {
          ...state.stats,
          factoriesBuilt: state.stats.factoriesBuilt + 1,
        },
      });

      soundEngine.play("buildingPlaced", "building");
      get().addNotification(
        "success",
        `Built ${def.name} for $${formatNumber(
          state.money - serverMoney,
        )}`,
      );
      get().updateQuestProgress("build", 1, type);
    },

    upgradeBuilding: async (id: string) => {
      const state = get();
      const building = state.buildings.find((b) => b.id === id);
      if (!building) return;

      const def = BUILDING_DEFS[building.type];

      // Phase 6: server-authoritative upgrade. Server computes scaled cost
      // (applies mega-project bonus), deducts money/resources, increments
      // level, and returns the post-upgrade state. Client applies that
      // verbatim and does not compute the cost itself.
      const validation = await import("../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer("upgrade", { buildingId: id }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? `Upgrade rejected by server`,
        );
        return;
      }

      const corrected = validation.correctedState;
      if (
        !Array.isArray(corrected?.buildings) ||
        typeof corrected.money !== "number" ||
        !corrected.resources
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Upgrade could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        money: corrected.money,
        buildings: corrected.buildings as typeof state.buildings,
        resources: corrected.resources as typeof state.resources,
      });
      soundEngine.play("buildingPlaced", "building");
      get().addNotification(
        "info",
        `Upgraded ${def.name} to level ${building.level + 1}`,
      );
    },

    toggleBuilding: async (id: string) => {
      const state = get();
      const building = state.buildings.find((b) => b.id === id);
      if (!building) return;
      const def = BUILDING_DEFS[building.type];
      const newActive = !building.active;

      // Phase 6: server-authoritative toggle. Server validates, persists,
      // and returns the post-toggle buildings array. Client applies that
      // verbatim and recomputes the power grid for UI freshness.
      const validation = await import("../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer(
          "toggle_building",
          { buildingId: id, enabled: newActive },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Building toggle rejected by server",
        );
        return;
      }

      const serverBuildings = validation.correctedState?.buildings;
      if (!Array.isArray(serverBuildings)) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Building toggle could not be confirmed by server. Please retry.",
        );
        return;
      }
      const authoritativeBuildings = serverBuildings as typeof state.buildings;

      // Recalculate power grid immediately so UI updates without waiting for
      // next tick. Uses productionCalculator's computePowerGrid for
      // consistency with gameTick.
      const tempState = { ...state, buildings: authoritativeBuildings };
      const cache = buildMultipliers(tempState);
      const tempResources = { ...state.resources };
      const powerResult = computePowerGrid(
        tempState,
        cache,
        tempResources,
        state.gameTick,
      );

      // Play sound for power toggle
      if (def?.category === "power") {
        soundEngine.play(
          newActive ? "buildingPlaced" : "powerOverload",
          "events",
        );
      }

      set({
        buildings: authoritativeBuildings,
        powerGrid: {
          totalProduction: powerResult.totalProduction,
          totalConsumption: powerResult.totalConsumption,
          efficiency: powerResult.efficiency,
          overload: powerResult.overload,
          plants: authoritativeBuildings.filter(
            (b) => BUILDING_DEFS[b.type]?.category === "power" && b.active,
          ),
        },
      });
    },

    selectBuilding: (id: string | null) => set({ selectedBuilding: id }),
  };
}

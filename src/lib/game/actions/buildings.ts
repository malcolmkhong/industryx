import type { BuildingType, BuildingInstance } from "../types";
import { BUILDING_DEFS } from "../configCache";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { getBuildingCost, isBuildingUnlocked } from "../utils/costCalculator";
import { getMegaProjectBonus } from "../utils/gameMath";
import { getBalance } from "../balanceConfig";
import { soundEngine } from "../soundEngine";
import { buildMultipliers, computePowerGrid } from "../productionCalculator";

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

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

      // Phase 2.3: BLOCKING. See actionValidator.ts.
      // Phase 1 Server-authoritative: when server returns `correctedState`,
      // apply it verbatim (server already persisted it). Otherwise fall back
      // to the local-cost computation (offline / degraded mode).
      const validation = await import("../actionValidator").then((m) =>
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

      // Server-authoritative path: apply exactly what server persisted.
      // Note: even when the server doesn't return correctedState (e.g., when
      // validation is bypassed by the offline-degraded fallback in
      // submitActionToServer), we still use the locally-computed cost.
      const serverBuildings = validation.correctedState?.buildings;
      const serverMoney = validation.correctedState?.money;

      if (Array.isArray(serverBuildings) && typeof serverMoney === "number") {
        set({
          money: serverMoney,
          buildings: serverBuildings as unknown as BuildingInstance[],
          stats: {
            ...state.stats,
            factoriesBuilt: state.stats.factoriesBuilt + 1,
          },
        });
      } else {
        // Offline / degraded fallback — apply the locally-computed mutation.
        const building: BuildingInstance = {
          id: generateId(),
          type,
          level: 1,
          active: true,
          efficiency: 1,
          placedAt: state.gameTick,
        };
        set({
          money: state.money - cost,
          buildings: [...state.buildings, building],
          stats: {
            ...state.stats,
            factoriesBuilt: state.stats.factoriesBuilt + 1,
          },
        });
      }

      soundEngine.play("buildingPlaced", "building");
      get().addNotification(
        "success",
        `Built ${def.name} for $${formatNumber(
          state.money -
            (typeof serverMoney === "number"
              ? serverMoney
              : state.money - cost),
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
      const validation = await import("../actionValidator").then((m) =>
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

      // Apply server-authoritative state. Fall back to optimistic local
      // computation only if the server omitted correctedState (defensive).
      const serverBuildings = (validation.correctedState?.buildings ??
        state.buildings) as typeof state.buildings;
      const serverMoney = validation.correctedState?.money ?? state.money;
      const serverResources = (validation.correctedState?.resources ??
        state.resources) as typeof state.resources;

      set({
        money: serverMoney,
        buildings: serverBuildings,
        resources: serverResources,
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
      const validation = await import("../actionValidator").then((m) =>
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

      // Apply server-returned authoritative state. The server has already
      // persisted the toggle, so we use its result rather than computing
      // locally. Fall back to the previous value if the server omitted the
      // field (defensive — server should always return it for toggle_building).
      const serverBuildings = (validation.correctedState?.buildings ??
        state.buildings) as typeof state.buildings;

      // Recalculate power grid immediately so UI updates without waiting for
      // next tick. Uses productionCalculator's computePowerGrid for
      // consistency with gameTick.
      const tempState = { ...state, buildings: serverBuildings };
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
        buildings: serverBuildings,
        powerGrid: {
          totalProduction: powerResult.totalProduction,
          totalConsumption: powerResult.totalConsumption,
          efficiency: powerResult.efficiency,
          overload: powerResult.overload,
          plants: serverBuildings.filter(
            (b) => BUILDING_DEFS[b.type]?.category === "power" && b.active,
          ),
        },
      });
    },

    selectBuilding: (id: string | null) => set({ selectedBuilding: id }),
  };
}

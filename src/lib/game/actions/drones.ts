import type { Drone } from "../types";
import { soundEngine } from "../soundEngine";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { generateDroneMissionsFromState } from "../utils/saveMigration";
import type { SetFn, GetFn } from "./_actionTypes";

// Inline: translate server technical error → user-friendly text.
function friendlyDroneError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("not found in fleet"))
    return "Drone not found. Please refresh.";
  if (e.includes("not idle")) return "Drone is busy with another mission.";
  if (e.includes("Invalid missionId format"))
    return "That mission is not available.";
  if (e.includes("Not enough money for drone fuel"))
    return "Not enough money for drone fuel.";
  return e || "Drone mission could not be started. Please try again.";
}

export function createDroneActions(set: SetFn, get: GetFn) {
  return {
    buyDrone: () => {
      const state = get();
      const cost = 2000 * state.drones.fleet.length;
      if (state.money < cost) {
        soundEngine.play("error", "building");
        get().addNotification(
          "error",
          `Not enough money to buy drone. Need $${formatNumber(cost)}`,
        );
        return;
      }
      const newDrone: Drone = {
        id: generateId(),
        status: "idle",
        missionEndTick: 0,
        missionId: null,
        speedLevel: 1,
        capacityLevel: 1,
        fuelEfficiencyLevel: 1,
      };
      set({
        money: state.money - cost,
        drones: {
          ...state.drones,
          fleet: [...state.drones.fleet, newDrone],
        },
      });
      soundEngine.play("buildingPlaced", "building");
      get().addNotification(
        "success",
        `🚁 New drone purchased for $${formatNumber(cost)}`,
      );
    },

    sendDrone: async (missionId: string, droneId: string) => {
      const state = get();
      const drone = state.drones.fleet.find((d) => d.id === droneId);
      if (!drone || drone.status !== "idle") return;

      // Generate missions to find the one with matching id (client-side
      // validation + to pass fuel/ticks to server).
      const missions = generateDroneMissionsFromState(state);
      const mission = missions.find((m) => m.id === missionId);
      if (!mission) return;

      // Phase 6: server-authoritative drone mission start. Server validates
      // drone state, computes fuel cost with efficiency upgrade, checks money
      // affordability, computes deliveryTicks with speed upgrade, and returns
      // the authoritative post-start state. Client applies exactly what the
      // server says.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "start_drone_mission",
          {
            missionId,
            droneId,
            // Pass mission data so the server doesn't need to re-derive from
            // BUILDING_DEFS. Server shape-checks these.
            missionFuelCost: mission.fuelCost,
            missionBaseTicks: mission.baseTicks,
          },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "building");
        console.error(`[sendDrone] server rejected: ${validation.error}`);
        get().addNotification("error", friendlyDroneError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      const serverDrones = corrected?.drones;
      if (
        typeof corrected?.money !== "number" ||
        !serverDrones ||
        !Array.isArray(serverDrones.fleet) ||
        typeof serverDrones.completedMissions !== "number" ||
        typeof serverDrones.totalEarned !== "number"
      ) {
        soundEngine.play("error", "building");
        get().addNotification(
          "error",
          "Drone mission could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        money: corrected.money,
        drones: serverDrones,
      });
      soundEngine.play("buttonClick", "building");
    },

    upgradeDrone: (
      droneId: string,
      type: "speed" | "capacity" | "fuelEfficiency",
    ) => {
      const state = get();
      const drone = state.drones.fleet.find((d) => d.id === droneId);
      if (!drone) return;

      let levelKey: "speedLevel" | "capacityLevel" | "fuelEfficiencyLevel";
      if (type === "speed") {
        levelKey = "speedLevel";
      } else if (type === "capacity") {
        levelKey = "capacityLevel";
      } else {
        levelKey = "fuelEfficiencyLevel";
      }
      const currentLevel = drone[levelKey];
      if (currentLevel >= 5) {
        get().addNotification(
          "warning",
          "This drone upgrade is already at max level!",
        );
        return;
      }

      let costMultiplier: number;
      if (type === "speed") {
        costMultiplier = 500;
      } else if (type === "capacity") {
        costMultiplier = 800;
      } else {
        costMultiplier = 600;
      }
      const cost = costMultiplier * currentLevel;
      if (state.money < cost) {
        soundEngine.play("error", "building");
        get().addNotification(
          "error",
          `Not enough money for upgrade. Need $${formatNumber(cost)}`,
        );
        return;
      }

      const updatedFleet = state.drones.fleet.map((d) =>
        d.id === droneId ? { ...d, [levelKey]: currentLevel + 1 } : d,
      );

      set({
        money: state.money - cost,
        drones: {
          ...state.drones,
          fleet: updatedFleet,
        },
      });
      soundEngine.play("buildingPlaced", "building");
    },

    generateDroneMissions: () => {
      return generateDroneMissionsFromState(get());
    },
  };
}

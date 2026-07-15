// Server-authoritative drone validators (start mission + collect).

import {
  applyStartDroneMissionMutation,
  applyCollectDroneMutation,
} from "../mutators/drones";
import { getBalance } from "../../../config/balance/balanceConfig";
import type { ServerGameData } from "../../../shared/types/types";

export function validateStartDroneMissionAction(
  missionId: string,
  droneId: string,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!missionId || typeof missionId !== "string") {
    return { valid: false, error: "Missing missionId in payload" };
  }
  if (!droneId || typeof droneId !== "string") {
    return { valid: false, error: "Missing droneId in payload" };
  }

  const fleet = state.drones?.fleet ?? [];
  const drone = fleet.find((d) => d.id === droneId);
  if (!drone) {
    return { valid: false, error: `Drone "${droneId}" not found in fleet` };
  }
  if (drone.status !== "idle") {
    return {
      valid: false,
      error: `Drone is not idle (status: ${drone.status}). Wait for current mission to complete.`,
    };
  }

  if (!missionId.startsWith("drone-mission-")) {
    return {
      valid: false,
      error: `Invalid missionId format: "${missionId}"`,
    };
  }

  const missionFuelCost = (state as unknown as { _missionFuelCost?: number })
    ._missionFuelCost;
  const missionBaseTicks = (state as unknown as { _missionBaseTicks?: number })
    ._missionBaseTicks;
  const fuel =
    typeof missionFuelCost === "number" && missionFuelCost >= 0
      ? missionFuelCost
      : 0;
  const baseTicks =
    typeof missionBaseTicks === "number" && missionBaseTicks > 0
      ? missionBaseTicks
      : 60;

  const fuelEfficiencyCoeff = getBalance().drone.fuelEfficiencyUpgradeCoeff;
  const fuelCost = Math.ceil(
    fuel / (1 + (drone.fuelEfficiencyLevel - 1) * fuelEfficiencyCoeff),
  );

  const money = state.money ?? 0;
  if (money < fuelCost) {
    return {
      valid: false,
      error: `Not enough money for drone fuel. Need $${fuelCost}, have $${Math.floor(money)}`,
    };
  }

  const speedCoeff = getBalance().drone.speedUpgradeCoeff;
  const deliveryTicks = Math.max(
    10,
    Math.floor(baseTicks / (1 + (drone.speedLevel - 1) * speedCoeff)),
  );
  if (!Number.isFinite(deliveryTicks) || deliveryTicks <= 0) {
    return {
      valid: false,
      error: `Computed deliveryTicks is non-finite (baseTicks=${baseTicks}, speedLevel=${drone.speedLevel})`,
    };
  }

  return {
    valid: true,
    correctedState: applyStartDroneMissionMutation(
      { droneId, missionId, fuelCost, deliveryTicks, drone },
      state,
    ),
  };
}

export function validateCollectDroneAction(
  droneId: string,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!droneId || typeof droneId !== "string") {
    return { valid: false, error: "Missing droneId in payload" };
  }

  const fleet = state.drones?.fleet ?? [];
  const drone = fleet.find((d) => d.id === droneId);
  if (!drone) {
    return { valid: false, error: `Drone "${droneId}" not found in fleet` };
  }
  if (drone.status !== "delivering") {
    return {
      valid: false,
      error: `Drone is not delivering (status: ${drone.status}). Nothing to collect.`,
    };
  }

  const currentTick = state.gameTick ?? 0;
  if (currentTick < drone.missionEndTick) {
    return {
      valid: false,
      error: `Drone mission not yet complete. Ends at tick ${drone.missionEndTick}, current ${currentTick}.`,
    };
  }

  return {
    valid: true,
    correctedState: applyCollectDroneMutation({ droneId, drone }, state),
  };
}
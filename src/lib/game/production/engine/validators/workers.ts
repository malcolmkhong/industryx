// Server-authoritative worker action validators (hire + upgrade + assign).

import {
  applyHireWorkerMutation,
  applyUpgradeWorkerMutation,
  applyAssignWorkerMutation,
} from "../mutators/workers";
import { getBalance } from "../../../config/balance/balanceConfig";
import type { GameConfig } from "../../../config/config";
import type { ServerGameData } from "../../../shared/types/types";

export function validateHireWorkerAction(
  workerType: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!workerType || typeof workerType !== "string") {
    return { valid: false, error: "Missing workerType in payload" };
  }
  const workerDef = config.workers.find((w) => w.id === workerType);
  if (!workerDef) {
    return {
      valid: false,
      error: `Unknown worker type "${workerType}"`,
    };
  }
  if (
    typeof workerDef.baseHireCost !== "number" ||
    workerDef.baseHireCost < 0
  ) {
    return {
      valid: false,
      error: `Worker "${workerType}" has invalid baseHireCost in config`,
    };
  }

  const money = state.money ?? 0;
  if (money < workerDef.baseHireCost) {
    return {
      valid: false,
      error: `Not enough money to hire ${workerDef.name}. Need $${workerDef.baseHireCost}, have $${Math.floor(money)}`,
    };
  }

  return {
    valid: true,
    correctedState: applyHireWorkerMutation(
      { workerType, baseHireCost: workerDef.baseHireCost },
      state,
    ),
  };
}

export function validateUpgradeWorkerAction(
  workerId: string,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!workerId || typeof workerId !== "string") {
    return { valid: false, error: "Missing workerId in payload" };
  }

  const workers = state.workers ?? [];
  const idx = workers.findIndex((w) => w.id === workerId);
  if (idx < 0) {
    return { valid: false, error: `Worker "${workerId}" not found` };
  }

  const worker = workers[idx];
  const xpNeeded = worker.level * getBalance().worker.levelUpXpBase;
  if (
    typeof worker.experience !== "number" ||
    !Number.isFinite(worker.experience) ||
    worker.experience < xpNeeded
  ) {
    return {
      valid: false,
      error: `Worker needs ${xpNeeded} XP to level up (has ${worker.experience ?? 0})`,
    };
  }

  return {
    valid: true,
    correctedState: applyUpgradeWorkerMutation({ workerIdx: idx }, state),
  };
}

export function validateAssignWorkerAction(
  workerId: string,
  buildingId: string | null,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!workerId || typeof workerId !== "string") {
    return { valid: false, error: "Missing workerId in payload" };
  }
  if (buildingId !== null && typeof buildingId !== "string") {
    return {
      valid: false,
      error: "buildingId must be a string or null",
    };
  }

  const workers = state.workers ?? [];
  const idx = workers.findIndex((w) => w.id === workerId);
  if (idx < 0) {
    return {
      valid: false,
      error: `Worker "${workerId}" not found`,
    };
  }

  if (buildingId !== null) {
    const buildings = state.buildings ?? [];
    if (!buildings.find((b) => b.id === buildingId)) {
      return {
        valid: false,
        error: `Building "${buildingId}" not found`,
      };
    }
  }

  const worker = workers[idx];
  // No-op if assignment target is the same as current.
  if (worker.assignedTo === buildingId) {
    return { valid: true, correctedState: { workers } };
  }

  return {
    valid: true,
    correctedState: applyAssignWorkerMutation(
      { workerIdx: idx, buildingId },
      state,
    ),
  };
}
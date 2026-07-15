// Server-authoritative worker mutations (hire + upgrade + assign).
//
// Assumes validator verified: worker type/ID/target valid, affordability, XP
// threshold met, building exists for assignment.

import { generateWorkerId } from "../ids";
import type {
  ServerGameData,
  Worker,
  WorkerType,
} from "../../../shared/types/types";

export interface HireWorkerMutationInput {
  workerType: string;
  baseHireCost: number;
}

export function applyHireWorkerMutation(
  input: HireWorkerMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { workerType, baseHireCost } = input;
  const money = state.money ?? 0;

  const newWorker: Worker = {
    id: generateWorkerId(),
    type: workerType as WorkerType,
    level: 1,
    experience: 0,
    assignedTo: null,
    efficiency: 1,
    speed: 1,
    maintenance: 0,
  };

  return {
    money: money - baseHireCost,
    workers: [...(state.workers ?? []), newWorker],
  };
}

export interface UpgradeWorkerMutationInput {
  workerIdx: number;
}

export function applyUpgradeWorkerMutation(
  input: UpgradeWorkerMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { workerIdx } = input;
  const workers = state.workers ?? [];
  const worker = workers[workerIdx];

  return {
    workers: workers.map((w, i) =>
      i === workerIdx ? { ...w, level: worker.level + 1, experience: 0 } : w,
    ),
  };
}

export interface AssignWorkerMutationInput {
  workerIdx: number;
  buildingId: string | null;
}

export function applyAssignWorkerMutation(
  input: AssignWorkerMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { workerIdx, buildingId } = input;
  const workers = state.workers ?? [];

  return {
    workers: workers.map((w, i) =>
      i === workerIdx ? { ...w, assignedTo: buildingId } : w,
    ),
  };
}
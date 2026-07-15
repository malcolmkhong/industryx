// Server-side power-grid computation. Thin delegating wrapper around the
// shared productionCalculator so the engine can call it without re-implementing
// the math.

import { computePowerGrid, type MultiplierCache, type PowerResult } from "../../productionCalculator";
import type {
  ServerGameData,
  BuildingDefinition,
  WorkerDefinition,
} from "../../../shared/types/types";

export function computePowerGridServer(
  state: ServerGameData,
  cache: MultiplierCache,
  resources: Record<string, number>,
  currentTick: number,
  buildings: Record<string, BuildingDefinition>,
  workerDefs: Record<string, WorkerDefinition>,
): PowerResult {
  return computePowerGrid(state, cache, resources, currentTick, {
    buildings,
    workers: workerDefs,
  });
}
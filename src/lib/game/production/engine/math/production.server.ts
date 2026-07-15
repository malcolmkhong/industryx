// Server-side per-building production computation. Thin delegating wrapper.

import { computeProduction, type MultiplierCache, type BuildResult } from "../../productionCalculator";
import type {
  BuildingInstance,
  BuildingDefinition,
  WorkerDefinition,
} from "../../../shared/types/types";

export function computeProductionServer(
  building: BuildingInstance,
  cache: MultiplierCache,
  availableResources: Record<string, number>,
  buildings: Record<string, BuildingDefinition>,
  workerDefs: Record<string, WorkerDefinition>,
): BuildResult {
  return computeProduction(building, cache, availableResources, {
    buildings,
    workers: workerDefs,
  });
}
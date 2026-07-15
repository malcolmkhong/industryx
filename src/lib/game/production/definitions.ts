// Building/worker definition resolution helpers used by the production math
// layer. Server-side callers can inject a Supabase-loaded `GameDefs` to
// bypass the static `BUILDING_DEFS` / `WORKER_DEFS` exports.

import type {
  BuildingDefinition,
  WorkerDefinition,
} from "../shared/types/types";
import { BUILDING_DEFS, WORKER_DEFS } from "../config/configCache";

/** Optional definition provider for server-side usage. */
export interface GameDefs {
  buildings: Record<string, BuildingDefinition>;
  workers: Record<string, WorkerDefinition>;
}

/** Resolve building definition: use injected defs if provided, else static import */
export function getBuildingDef(type: string, defs?: GameDefs) {
  return defs ? defs.buildings[type] : BUILDING_DEFS[type];
}

/** Resolve worker definition: use injected defs if provided, else static import */
export function getWorkerDef(type: string, defs?: GameDefs) {
  return defs ? defs.workers[type] : WORKER_DEFS[type];
}

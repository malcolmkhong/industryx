// Server-side payout computation. Thin delegating wrapper.

import { computePayout, type MultiplierCache, type PayoutResult } from "../../productionCalculator";
import type {
  ServerGameData,
  BuildingDefinition,
} from "../../../shared/types/types";

export function computePayoutServer(
  state: ServerGameData,
  cache: MultiplierCache,
  buildings: Record<string, BuildingDefinition>,
): PayoutResult {
  // Get workerDefs from cache.gameDefs if available, otherwise empty.
  const workerDefs = cache.gameDefs?.workers ?? {};
  return computePayout(state, cache, { buildings, workers: workerDefs });
}
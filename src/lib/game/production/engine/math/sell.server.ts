// Server-side sell-multiplier computation. Thin delegating wrapper.

import { computeSellMultiplier, type MultiplierCache } from "../../productionCalculator";
import type { ServerGameData } from "../../../shared/types/types";

export function computeSellMultiplierServer(
  _state: ServerGameData,
  cache: MultiplierCache,
): number {
  return computeSellMultiplier(_state, cache);
}
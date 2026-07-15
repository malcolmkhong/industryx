// Server-side endgame passive-income computation. Thin delegating wrapper.

import { computeEndgameIncome, type MultiplierCache, type EndgameResult } from "../../productionCalculator";
import type { ServerGameData } from "../../../shared/types/types";

export function computeEndgameIncomeServer(
  state: ServerGameData,
  cache: MultiplierCache,
): EndgameResult {
  return computeEndgameIncome(state, cache);
}
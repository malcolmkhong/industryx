// Sell multiplier math: marketResearch + prestigeMarket + megaMarket → final
// per-tick sell multiplier (sum of bonuses over base).

import type { ServerGameData } from "../../shared/types/types";
import { getBalance } from "../../config/balance/balanceConfig";
import type { MultiplierCache } from "./multipliers";

export function computeSellMultiplier(
  _state: ServerGameData,
  cache: MultiplierCache,
): number {
  return getBalance().market.baseSellMultiplier + cache.marketBonus;
}

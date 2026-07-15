// Payout math: per-cycle money income from extractors, factories, and power
// plants. Avg efficiency applied to total, then production/weather multipliers.

import type { ServerGameData } from "../../shared/types/types";
import { getBalance } from "../../config/balance/balanceConfig";
import { getBuildingDef, type GameDefs } from "../definitions";
import type { MultiplierCache } from "./multipliers";

/** Payout result (per payout cycle). */
export interface PayoutResult {
  amountPerCycle: number;
  breakdown: { extractors: number; factories: number; power: number };
}

export function computePayout(
  state: ServerGameData,
  cache: MultiplierCache,
  defs?: GameDefs,
): PayoutResult {
  const _defs = defs ?? cache.gameDefs;
  // V-011 (PR-BP-3): per-category payout rates now live in the
  // server-authoritative balance config (`game_config_balance.payout`).
  // Migration 077 seeded values matching the legacy literals
  // (extractor=20, factory=50, power=10) so player outcomes are
  // preserved on first deploy.
  const { extractorRate, factoryRate, powerRate } = getBalance().payout;
  const activeBuildings = state.buildings.filter((b) => b.active);
  const extractors = activeBuildings.filter(
    (b) => getBuildingDef(b.type, _defs)?.category === "extractor",
  );
  const factories = activeBuildings.filter(
    (b) => getBuildingDef(b.type, _defs)?.category === "factory",
  );
  const powerPlants = activeBuildings.filter(
    (b) => getBuildingDef(b.type, _defs)?.category === "power",
  );

  const extractorIncome = extractors.reduce(
    (sum, b) => sum + extractorRate * b.level * b.efficiency,
    0,
  );
  const factoryIncome = factories.reduce(
    (sum, b) => sum + factoryRate * b.level * b.efficiency,
    0,
  );
  const powerIncome = powerPlants.reduce(
    (sum, b) => sum + powerRate * b.level * b.efficiency,
    0,
  );

  let amount = extractorIncome + factoryIncome + powerIncome;
  // NO gameSpeed multiplication — ticks already fire faster

  const avgEfficiency =
    activeBuildings.length > 0
      ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) /
        activeBuildings.length
      : 0;
  amount *= avgEfficiency;

  amount *= 1 + cache.productionBonus;
  amount *= cache.eventProductionGlobal;
  amount *= cache.weatherProduction;

  return {
    amountPerCycle: Math.floor(amount),
    breakdown: {
      extractors: extractorIncome,
      factories: factoryIncome,
      power: powerIncome,
    },
  };
}

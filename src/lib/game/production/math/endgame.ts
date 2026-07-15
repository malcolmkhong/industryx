// Endgame passive income (Dyson, Quantum, Tier-5 buildings). Per-tick money,
// research, and corporation point additions when an endgame building is
// active and powered.

import type { ServerGameData } from "../../shared/types/types";
import type { GameBalanceConfig } from "../../config/balance/balanceTypes";
import { getBalance } from "../../config/balance/balanceConfig";
import type { MultiplierCache } from "./multipliers";

/** Endgame building passive income result (per tick). */
export interface EndgameResult {
  moneyPerTick: number;
  researchPerTick: number;
  corpPerTick: number;
}

/**
 * V-012 (PR-BP-3, 2026-07-15): the 14-case hardcoded switch is replaced
 * with a per-type lookup against `game_config_balance.endgame`. The map
 * is keyed by the 14 endgame building types — Phase B of TIER5_WIRING_PLAN
 * ships all eight tier-5 rows; future tier-5 buildings are a balance-
 * config row update + a type-table entry, with no change to this file.
 *
 * Adding a new tier-5 building now requires:
 *   1. INSERT into `game_config_balance` with key=`endgame` and the new
 *      type's {moneyPerTick, researchPerTick, corpPerTick} rates.
 *   2. Add the type name to `GameBalanceConfig.endgame` and to the
 *      `endgame` validator block.
 *   3. Add the type name to `ENDGAME_BUILDING_TYPES` below and to the
 *      `BuildingType` union if it isn't already there.
 * Without all three, the building produces zero income (was the silent-
 * zero failure mode of the audit §5.9 TIER-5 REGRESSION GUARD).
 */
const ENDGAME_BUILDING_TYPES: ReadonlySet<string> = new Set([
  "dysonCollector",
  "quantumTeleporter",
  "dimensionalGateway",
  "timeDistorter",
  "galacticForge",
  // Tier-5 endgame (Phase B of TIER5_WIRING_PLAN)
  "omniscienceArray",
  "worldEngine",
  "planetaryShield",
  "starReactor",
  "voidEngine",
  "quantumExchange",
  "megaCorpHQ",
  "dimensionalNexus",
  "galacticArmada",
]);

type EndgameRates = GameBalanceConfig["endgame"][keyof GameBalanceConfig["endgame"]];

const ZERO: EndgameRates = { moneyPerTick: 0, researchPerTick: 0, corpPerTick: 0 };

function ratesFor(type: string, endgame: GameBalanceConfig["endgame"]): EndgameRates {
  switch (type) {
    case "dysonCollector": return endgame.dysonCollector;
    case "quantumTeleporter": return endgame.quantumTeleporter;
    case "dimensionalGateway": return endgame.dimensionalGateway;
    case "timeDistorter": return endgame.timeDistorter;
    case "galacticForge": return endgame.galacticForge;
    case "omniscienceArray": return endgame.omniscienceArray;
    case "worldEngine": return endgame.worldEngine;
    case "planetaryShield": return endgame.planetaryShield;
    case "starReactor": return endgame.starReactor;
    case "voidEngine": return endgame.voidEngine;
    case "quantumExchange": return endgame.quantumExchange;
    case "megaCorpHQ": return endgame.megaCorpHQ;
    case "dimensionalNexus": return endgame.dimensionalNexus;
    case "galacticArmada": return endgame.galacticArmada;
    // Unknown / new endgame type: rates default to zero rather than
    // throwing. The TIER-5 REGRESSION GUARD explicitly wants zero to
    // be the fallback so missing rates are visible (zero income, not
    // stale hardcoded revenue from an old build).
    default: return ZERO;
  }
}

export function computeEndgameIncome(
  state: ServerGameData,
  cache: MultiplierCache,
): EndgameResult {
  let moneyPerTick = 0;
  let researchPerTick = 0;
  let corpPerTick = 0;

  const endgame = getBalance().endgame;
  const endgameBuildings = state.buildings.filter(
    (b) => b.active && ENDGAME_BUILDING_TYPES.has(b.type),
  );

  for (const b of endgameBuildings) {
    let endEff = b.efficiency * cache.powerEfficiency;

    if (cache.megaFactoryUnlocked) {
      endEff *=
        cache.eventProductionGlobal *
        cache.weatherProduction *
        cache.transportProductionBonus;
      endEff *= 1 + cache.productionBonus;
    }

    const rate = b.level * endEff;
    const r = ratesFor(b.type, endgame);
    moneyPerTick += Math.floor(r.moneyPerTick * rate);
    researchPerTick += Math.floor(r.researchPerTick * rate);
    corpPerTick += Math.floor(r.corpPerTick * rate);
  }

  return { moneyPerTick, researchPerTick, corpPerTick };
}

// Server-side full production-snapshot builder.
//
// Composes the math layer (power grid, per-building production, payout, sell
// multiplier, endgame income) into a single ProductionSnapshot returned by
// the server engine. Used by both one-shot reads and the tick loop's final
// snapshot.

import {
  emptyProductionSnapshot,
  computeProduction,
  computePowerGrid,
  computePayout,
  computeSellMultiplier,
  computeEndgameIncome,
  type ProductionSnapshot,
} from "../../productionCalculator";
import type { ServerGameData } from "../../../shared/types/types";
import type { GameConfig } from "../../../config/config";

import { buildMultipliersServer, buildWorkerDefsMap } from "../math/multipliers.server";

export function buildProductionSnapshotServer(
  state: ServerGameData,
  config: GameConfig,
): ProductionSnapshot {
  const snapshot = emptyProductionSnapshot();
  const buildings = config.buildings;
  const workerDefs = buildWorkerDefsMap(config.workers);

  const cache = buildMultipliersServer(state, config);

  const resourcesCopy = { ...state.resources };
  const powerResult = computePowerGrid(
    state,
    cache,
    resourcesCopy,
    state.gameTick,
    { buildings, workers: workerDefs },
  );

  cache.powerEfficiency = powerResult.efficiency;

  snapshot.powerProduction = powerResult.totalProduction;
  snapshot.powerConsumption = powerResult.totalConsumption;
  snapshot.powerEfficiency = powerResult.efficiency;
  snapshot.powerOverload = powerResult.overload;

  for (const building of state.buildings) {
    const result = computeProduction(
      building,
      cache,
      resourcesCopy,
      { buildings, workers: workerDefs },
    );

    // C-001 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
    // Blocked factories return `canProduce: false` but still carry a
    // populated `outputs` array (the potential output, useful for the
    // calculator and demand planning). The server's authoritative
    // inventory/wallet was never credited by `runServerTicks`, so the
    // snapshot must not surface potential output as actual production.
    // `actualConsumption` is already correct because `actualInputs` is
    // empty for blocked factories; `consumption` continues to advertise
    // input demand for the planner.
    snapshot.buildings[building.id] = {
      outputs: result.canProduce ? result.outputs : [],
      inputs: result.inputs,
      efficiency: result.efficiency,
    };

    for (const input of result.inputs) {
      snapshot.consumption[input.resource] =
        (snapshot.consumption[input.resource] ?? 0) + input.amount;
    }

    if (!result.canProduce) continue;

    for (const output of result.outputs) {
      snapshot.production[output.resource] =
        (snapshot.production[output.resource] ?? 0) + output.amount;
    }
    for (const input of result.actualInputs) {
      snapshot.actualConsumption[input.resource] =
        (snapshot.actualConsumption[input.resource] ?? 0) + input.amount;
    }
  }

  const payout = computePayout(state, cache, {
    buildings,
    workers: cache.gameDefs?.workers ?? {},
  });
  snapshot.payoutPerCycle = payout.amountPerCycle;
  snapshot.payoutBreakdown = payout.breakdown;

  snapshot.sellMultiplier = computeSellMultiplier(state, cache);

  const endgame = computeEndgameIncome(state, cache);
  snapshot.endgameMoney = endgame.moneyPerTick;
  snapshot.endgameResearch = endgame.researchPerTick;
  snapshot.endgameCorp = endgame.corpPerTick;

  snapshot.moneyIncomeRate = endgame.moneyPerTick;
  snapshot.rpIncomeRate = endgame.researchPerTick;
  snapshot.cpIncomeRate = endgame.corpPerTick;
  // V-035 / PR-BP-3 §2.3: pair income + expense per currency on the
  // snapshot. Expense is sourced from `actualConsumption` (the per-tick
  // total of what factories actually consumed). Current recipes do not
  // consume money/RP/CP as inputs, so these read 0 today — but the
  // wiring is closed: a future building definition that lists
  // `money`/`researchPoints`/`corporationPoints` in its `inputs` array
  // will automatically populate its expense rate. Consumers
  // (GlobalResourceMonitorPanel, AIAdvisorPanel) read these fields
  // directly via specific selectors.
  snapshot.moneyExpenseRate = snapshot.actualConsumption.money ?? 0;
  snapshot.rpExpenseRate =
    snapshot.actualConsumption.researchPoints ?? 0;
  snapshot.cpExpenseRate =
    snapshot.actualConsumption.corporationPoints ?? 0;

  return snapshot;
}
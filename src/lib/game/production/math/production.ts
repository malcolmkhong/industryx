// Per-building production math (per-tick). Extractor / factory split with
// power-aware efficiency, worker bonuses, and factory input gating.

import type { BuildingInstance } from "../../shared/types/types";
import { getBalance } from "../../config/balance/balanceConfig";
import { getBuildingDef, getWorkerDef, type GameDefs } from "../definitions";
import type { MultiplierCache } from "./multipliers";
import { recordSilentFailure } from "../observability";

/** Per-building production result (per tick). */
export interface BuildResult {
  outputs: { resource: string; amount: number }[]; // per tick
  inputs: { resource: string; amount: number }[]; // per tick (demand)
  actualInputs: { resource: string; amount: number }[]; // per tick (what was actually consumed)
  efficiency: number; // final efficiency multiplier applied
  canProduce: boolean;
  workerPowerSavings: number; // power saved by worker maintenance (for this building)
  /**
   * V-005 / PR-BP-3 §2.2: diagnostic reason for why the building did not
   * produce (or produced zero output). Distinguishes cases that previously
   * returned identical shapes:
   *   - `unknown_definition` — building type has no row in BUILDING_DEFS.
   *   - `inactive`            — building is in the player's inventory
   *                             but flagged `active=false` (player-toggle
   *                             or one-off disable).
   *   - `missing_inputs`      — factory had insufficient inputs to run
   *                             this tick (`canProduce=false`).
   *   - `missing_recipe`      — def exists but has neither extractor
   *                             outputs nor factory inputs+outputs.
   *   - `null`                — happy path (`canProduce=true`); no
   *                             diagnostic needed.
   *
   * Observers (server tick, snapshot builder, future telemetry) read this
   * to surface "why nothing happened" instead of silently dropping zero
   * output. Inactive semantics are preserved: `canProduce=false`,
   * `efficiency=0`, empty outputs.
   */
  reason: null | "unknown_definition" | "inactive" | "missing_inputs" | "missing_recipe";
}

export function computeProduction(
  building: BuildingInstance,
  cache: MultiplierCache,
  availableResources: Record<string, number>,
  defs?: GameDefs,
): BuildResult {
  const _defs = defs ?? cache.gameDefs;
  const def = getBuildingDef(building.type, _defs);
  // V-005 / PR-BP-3 §2.2: split the silent-skip branch into two
  // distinct diagnostic reasons. `def` checks first because an unknown
  // definition is the deeper cause when both fail.
  if (!def) {
    recordSilentFailure("unknown_definition");
    return {
      outputs: [],
      inputs: [],
      actualInputs: [],
      efficiency: 0,
      canProduce: false,
      workerPowerSavings: 0,
      reason: "unknown_definition",
    };
  }
  if (!building.active) {
    recordSilentFailure("inactive");
    return {
      outputs: [],
      inputs: [],
      actualInputs: [],
      efficiency: 0,
      canProduce: false,
      workerPowerSavings: 0,
      reason: "inactive",
    };
  }

  let efficiency =
    building.efficiency *
    cache.powerEfficiency *
    cache.eventProductionGlobal *
    cache.weatherProduction *
    cache.transportProductionBonus;

  const targetedEventMult = cache.eventProductionTargeted.get(building.type);
  if (targetedEventMult) efficiency *= targetedEventMult;

  if (def.category === "extractor") efficiency *= 1 + cache.extractorBonus;
  if (def.category === "factory") efficiency *= 1 + cache.factoryBonus;
  if (def.category === "factory" && def.tier === 1)
    efficiency *= 1 + cache.t1FactoryBonus;
  if (def.category === "factory" && def.tier === 2)
    efficiency *= 1 + cache.t2FactoryBonus;
  if (def.category === "factory" && def.tier === 3)
    efficiency *= 1 + cache.t3FactoryBonus;

  const specificBonus = cache.specificBuildingBonuses.get(building.type);
  if (specificBonus) efficiency *= 1 + specificBonus;

  const assignedWorkers = cache.workersByBuilding.get(building.id) ?? [];
  let workerMaintenanceReduction = 0;
  for (const w of assignedWorkers) {
    const wDef = getWorkerDef(w.type, _defs);
    if (wDef) {
      efficiency *=
        1 + wDef.effects.speed * w.level * (1 + cache.workerEfficiencyTotal);
      efficiency *=
        1 +
        wDef.effects.efficiency * w.level * (1 + cache.workerEfficiencyTotal);
      workerMaintenanceReduction +=
        wDef.effects.maintenance * w.level * (1 + cache.workerEfficiencyTotal);
    }
  }

  const buildingPowerReduction = Math.min(
    getBalance().worker.maxPowerReductionPerBuilding,
    workerMaintenanceReduction,
  );
  const workerPowerSavings =
    buildingPowerReduction > 0 && def.basePowerConsumption > 0
      ? def.basePowerConsumption *
        building.level *
        building.efficiency *
        buildingPowerReduction
      : 0;

  efficiency *= 1 + cache.productionBonus;

  if (def.category === "extractor" && def.outputs) {
    const outputs = def.outputs
      .filter((o) => o.resource !== "money")
      .map((o) => ({
        resource: o.resource,
        amount: o.amount * def.baseProductionRate * building.level * efficiency,
      }));
    return {
      outputs,
      inputs: [],
      actualInputs: [],
      efficiency,
      canProduce: true,
      workerPowerSavings,
      reason: null,
    };
  }

  if (def.category === "factory" && def.inputs && def.outputs) {
    const adjustedInputs = def.inputs
      .filter((i) => i.resource !== "money")
      .map((i) => ({
        resource: i.resource,
        amount: i.amount * building.level * efficiency,
      }));

    let canProduce = true;
    for (const input of adjustedInputs) {
      if ((availableResources[input.resource] ?? 0) < input.amount) {
        canProduce = false;
        break;
      }
    }

    const outputs = def.outputs
      .filter((o) => o.resource !== "money")
      .map((o) => ({
        resource: o.resource,
        amount: o.amount * def.baseProductionRate * building.level * efficiency,
      }));

    if (!canProduce) recordSilentFailure("missing_inputs");
    return {
      outputs,
      inputs: adjustedInputs,
      actualInputs: canProduce ? adjustedInputs : [],
      efficiency,
      canProduce,
      workerPowerSavings,
      // V-005 / PR-BP-3 §2.2: factory that ran out of inputs mid-tick.
      reason: canProduce ? null : "missing_inputs",
    };
  }

  recordSilentFailure("missing_recipe");
  return {
    outputs: [],
    inputs: [],
    actualInputs: [],
    efficiency,
    canProduce: true,
    workerPowerSavings,
    // V-005 / PR-BP-3 §2.2: definition present but neither extractor nor
    // factory recipe resolved. Distinguishes "ran and produced nothing"
    // from true happy paths (which carry `reason: null`).
    reason: "missing_recipe",
  };
}

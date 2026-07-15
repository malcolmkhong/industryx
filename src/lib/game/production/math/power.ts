// Power-grid math (production + consumption + efficiency + overload).
// Per-tick: building.power, building.fuel, building.solar/wind oscillation.
// Worker maintenance reduces effective power consumption.
//
// PR-BP-5 §7: emits `fuel_starved` counter on the §5.6 case-4 silent branch.

import type { ServerGameData } from "../../shared/types/types";
import { getBalance } from "../../config/balance/balanceConfig";
import { getBuildingDef, getWorkerDef, type GameDefs } from "../definitions";
import type { MultiplierCache } from "./multipliers";
import { recordSilentFailure } from "../observability";

/** Power grid result (per tick). */
export interface PowerResult {
  totalProduction: number;
  totalConsumption: number;
  efficiency: number; // 0.0–1.0
  overload: boolean;
  /** Per-building fuel consumption details (for rate tracking) */
  fuelConsumption: { resource: string; amount: number; actualAmount: number }[];
}

export function computePowerGrid(
  state: ServerGameData,
  cache: MultiplierCache,
  resources: Record<string, number>,
  currentTick: number,
  defs?: GameDefs,
): PowerResult {
  const _defs = defs ?? cache.gameDefs;
  let totalProduction = 0;
  let totalConsumption = 0;
  const fuelConsumption: {
    resource: string;
    amount: number;
    actualAmount: number;
  }[] = [];

  const powerBuildings = state.buildings.filter(
    (b) => getBuildingDef(b.type, _defs)?.category === "power" && b.active,
  );

  for (const b of powerBuildings) {
    const def = getBuildingDef(b.type, _defs);
    if (!def) continue;
    let production = def.basePowerProduction * b.level * b.efficiency;

    if (def.fuel && def.fuelRate) {
      const fuelConsumed = def.fuelRate * b.level;
      if (resources[def.fuel] >= fuelConsumed) {
        resources[def.fuel] -= fuelConsumed;
        totalProduction += production;
        fuelConsumption.push({
          resource: def.fuel,
          amount: fuelConsumed,
          actualAmount: fuelConsumed,
        });
      } else {
        production *= getBalance().power.fuelStarvedOutputRatio;
        totalProduction += production;
        const actuallyConsumed = resources[def.fuel] || 0;
        fuelConsumption.push({
          resource: def.fuel,
          amount: fuelConsumed,
          actualAmount: actuallyConsumed,
        });
        // PR-BP-5 §7 / audit §5.6 case 4: telemetry counter for the silent
        // "fuel-starved plant" branch. The branch itself is documented and
        // intended (per audit), but the silent counter surfaces it on the
        // admin audit dashboard so an ops engineer can spot chronic
        // starvation without scraping logs.
        recordSilentFailure("fuel_starved");
        // NOTE: Do NOT drain remaining fuel — store leaves it untouched when supply is insufficient
      }
    } else {
      const bal = getBalance();
      if (b.type === "solarFarm") {
        const dayFactor =
          bal.power.solarAmplitudeBase +
          bal.power.solarAmplitudeSwing *
            Math.sin(currentTick * bal.power.solarOscillationFreq);
        production *=
          Math.max(bal.power.solarMinOutput, dayFactor) * cache.weatherSolar;
      }
      if (b.type === "windTurbine") {
        const windFactor =
          bal.power.windAmplitudeBase +
          bal.power.windAmplitudeSwing *
            Math.sin(currentTick * bal.power.windOscillationFreq + Math.PI / 3);
        production *=
          Math.max(bal.power.windMinOutput, windFactor) * cache.weatherWind;
      }
      totalProduction += production;
    }
  }

  const bal = getBalance();

  const consumingBuildings = state.buildings.filter((b) => {
    const d = getBuildingDef(b.type, _defs);
    return d && d.category !== "power" && b.active;
  });

  for (const b of consumingBuildings) {
    const def = getBuildingDef(b.type, _defs);
    if (!def) continue;
    totalConsumption += def.basePowerConsumption * b.level * b.efficiency;
  }
  const energyEfficiencyReduction = cache.hasEnergyEfficiency
    ? bal.research.energyEfficiencyReduction
    : 0;
  const powerOptimizationReduction = cache.hasPowerOptimization
    ? bal.research.powerOptimizationReduction
    : 0;
  totalConsumption *=
    (1 - energyEfficiencyReduction) *
    (1 - powerOptimizationReduction) *
    cache.eventPowerConsumption;

  totalProduction *= 1 + cache.powerBonus;

  // Compute efficiency BEFORE worker savings (matches store.ts behavior)
  const efficiency =
    totalProduction > 0
      ? Math.max(
          bal.power.minEfficiency,
          Math.min(1, totalProduction / Math.max(0.001, totalConsumption)),
        )
      : bal.power.minEfficiency;
  const overload = totalConsumption > totalProduction;

  // Worker power savings (applied AFTER efficiency)
  let workerPowerSavings = 0;
  for (const b of state.buildings) {
    if (!b.active) continue;
    const def = getBuildingDef(b.type, _defs);
    if (!def || def.basePowerConsumption <= 0) continue;

    const assignedWorkers = cache.workersByBuilding.get(b.id) ?? [];
    let workerMaintenanceReduction = 0;
    for (const w of assignedWorkers) {
      const wDef = getWorkerDef(w.type, _defs);
      if (wDef) {
        workerMaintenanceReduction +=
          wDef.effects.maintenance *
          w.level *
          (1 + cache.workerEfficiencyTotal);
      }
    }
    const buildingPowerReduction = Math.min(
      bal.worker.maxPowerReductionPerBuilding,
      workerMaintenanceReduction,
    );
    if (buildingPowerReduction > 0) {
      workerPowerSavings +=
        def.basePowerConsumption *
        b.level *
        b.efficiency *
        buildingPowerReduction;
    }
  }

  const adjustedWorkerPowerSavings =
    workerPowerSavings *
    (1 - energyEfficiencyReduction) *
    (1 - powerOptimizationReduction) *
    cache.eventPowerConsumption;
  totalConsumption = Math.max(0, totalConsumption - adjustedWorkerPowerSavings);

  return {
    totalProduction,
    totalConsumption,
    efficiency,
    overload,
    fuelConsumption,
  };
}

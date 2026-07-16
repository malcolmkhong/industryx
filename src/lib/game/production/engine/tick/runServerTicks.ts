// Server-side game tick runner.
//
// Runs N ticks of the simplified engine used for offline progress, server-side
// validation, and cloud-save integrity checks. Each tick:
//   1. Advances gameTick
//   2. Builds multiplier cache for the current state
//   3. Computes power grid and updates state.powerGrid + consumes fuel
//   4. Computes per-building production and applies inputs/outputs
//   5. Adds endgame passive income
//   6. Advances weather
//
// After all ticks, returns the final state plus a final production snapshot.

import type {
  ResourceType,
  ServerGameData,
} from "../../../shared/types/types";
import type { GameConfig } from "../../../config/config";
import {
  type ProductionSnapshot,
  computeProduction,
  computePowerGrid,
  computeEndgameIncome,
} from "../../productionCalculator";

import { buildMultipliersServer, buildWorkerDefsMap, getBuildingDef } from "../math/multipliers.server";
import { buildProductionSnapshotServer } from "./productionSnapshot";
import { advanceWeatherTick } from "./weatherTick";
import { hasUnlimitedStorage } from "../../../shared/utils/hasUnlimitedStorage";
import { recordSilentFailure } from "../../observability";

/**
 * V-003 (PR-BP-3 §2.1): per-resource storage overflow report. Aggregated
 * across every output that exceeded capacity in the current tick batch.
 * A resource appears here ONLY when `wasted > 0`; the report is dropped
 * onto the production snapshot for storage observers (StoragePanel etc.)
 * to surface overflow instead of silently capping.
 */
export type StorageOverflowReport = Record<
  string,
  { produced: number; accepted: number; wasted: number }
>;

export interface TickResult {
  newState: ServerGameData;
  productionSnapshot: ProductionSnapshot;
}

/**
 * V-003 + V-004 (PR-BP-3 §2.1): server-authoritative capacity resolution.
 *
 * 1. `hasUnlimitedStorage(state.megaProjects)` (Terraforming Engine mega
 *    project) is honored — same rule as the client `getCapacity()` helper
 *    in `costCalculator.ts`.
 * 2. Missing or non-finite `resourceCapacity` entries fail closed
 *    (RangeError). The previous `?? Infinity` fallback silently created
 *    unbounded resources whenever a row was missing — a DB-integrity risk
 *    flagged by audit §5.8.
 */
function resolveCapacityForResource(
  state: ServerGameData,
  resource: ResourceType,
): number {
  if (hasUnlimitedStorage(state.megaProjects)) return Infinity;
  const cap = state.resourceCapacity[resource];
  if (typeof cap !== "number" || !Number.isFinite(cap)) {
    throw new RangeError(
      `[runServerTicks] missing or non-finite resourceCapacity for "${resource}". ` +
        `Seed a finite capacity row, or complete Terraforming Engine mega project ` +
        `to grant unlimited storage server-side.`,
    );
  }
  return cap;
}

export function runServerTicks(
  initialState: ServerGameData,
  ticks: number,
  config: GameConfig,
): TickResult {
  const state = structuredClone(initialState);
  const buildings = config.buildings;
  const workerDefs = buildWorkerDefsMap(config.workers);

  // V-003 (PR-BP-3 §2.1): structured overflow tracker. Keyed by resource;
  // populated only when a per-tick output exceeded its capacity.
  const storageOverflow: StorageOverflowReport = {};

  for (let i = 0; i < ticks; i++) {
    state.gameTick += 1;

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

    state.powerGrid = {
      totalProduction: powerResult.totalProduction,
      totalConsumption: powerResult.totalConsumption,
      efficiency: powerResult.efficiency,
      overload: powerResult.overload,
      plants: state.buildings.filter((b) => {
        const def = getBuildingDef(b.type, buildings);
        return def?.category === "power";
      }),
    };

    for (const fc of powerResult.fuelConsumption) {
      if (state.resources[fc.resource as ResourceType] !== undefined) {
        state.resources[fc.resource as ResourceType] = Math.max(
          0,
          state.resources[fc.resource as ResourceType] - fc.actualAmount,
        );
      }
    }

    for (const building of state.buildings) {
      const result = computeProduction(
        building,
        cache,
        state.resources,
        { buildings, workers: workerDefs },
      );

      if (!result.canProduce) continue;

      for (const input of result.actualInputs) {
        if (state.resources[input.resource as ResourceType] !== undefined) {
          state.resources[input.resource as ResourceType] -= input.amount;
        }
      }

      for (const output of result.outputs) {
        if (output.resource === "money") {
          state.money += output.amount;
          state.totalMoneyEarned += output.amount;
        } else if (
          state.resources[output.resource as ResourceType] !== undefined
        ) {
          // V-003 + V-004 (PR-BP-3 §2.1): resolve capacity via the
          // shared, fail-closed helper (honors `hasUnlimitedStorage`).
          const capacity = resolveCapacityForResource(
            state,
            output.resource as ResourceType,
          );
          const current =
            state.resources[output.resource as ResourceType] ?? 0;
          const accepted = Math.max(0, Math.min(capacity, current + output.amount));
          const wasted = Math.max(0, current + output.amount - accepted);
          state.resources[output.resource as ResourceType] = accepted;
          if (wasted > 0) {
            const bucket = storageOverflow[output.resource] ?? {
              produced: 0,
              accepted: 0,
              wasted: 0,
            };
            bucket.produced += output.amount;
            bucket.accepted += accepted - current;
            bucket.wasted += wasted;
            storageOverflow[output.resource] = bucket;
            // PR-BP-5 §7: telemetry counter for §5.6 case 3 (storage overflow).
            recordSilentFailure("storage_overflow");
          }
        }
      }
    }

    const endgame = computeEndgameIncome(state, cache);
    state.money += endgame.moneyPerTick;
    state.totalMoneyEarned += endgame.moneyPerTick;
    state.researchPoints += endgame.researchPerTick;
    state.prestigeState.corporationPoints += endgame.corpPerTick;

    advanceWeatherTick(state);
  }

  const productionSnapshot = buildProductionSnapshotServer(state, config);
  // V-003 (PR-BP-3 §2.1): attach structured overflow report to the
  // snapshot so StoragePanel (and future storage observers) can render
  // waste instead of silently discarding it.
  productionSnapshot.storageOverflow = storageOverflow;

  return { newState: state, productionSnapshot };
}
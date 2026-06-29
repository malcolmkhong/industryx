/**
 * Server-Side Tick Validator — Phase 7.1
 *
 * Phase 7.1: Computes the theoretical maximum money a player should have based on
 *  * their buildings, research, workers, weather, and elapsed ticks.
 *
 *
 * The server uses this to detect gradual cheating (e.g., 10%/save inflation
 * that stays within the per-save delta check threshold but accumulates over time).
 *
 * SPEC INVARIANT: At any point in time, the server can answer:
 * "Given this player's buildings, research, workers, and time elapsed,
 *  the maximum possible money is $X." If the client claims more than X, cheating.
 */

import { GameState } from './types';
import { GameConfig } from './config';
import { computeProduction, computePayout, computeEndgameIncome } from './productionCalculator';
import { buildMultipliersServer } from './serverEngine';

/**
 * Compute the theoretical maximum money a player should have.
 *
 * Uses the SAME computeProduction, computePayout, and computeEndgameIncome
 * from productionCalculator.ts that the client uses, so the server's
 * expectation matches what the client should have produced.
 *
 * The multiplier cache is built via buildMultipliersServer which uses the
 * Supabase-loaded GameConfig — ensuring the server's modifier calculations
 * match the client's production pipeline when running with the same config.
 *
 * @param gameState - The player's current game state
 * @param elapsedTicks - How many ticks have passed since the last validation
 * @param config - Game configuration (buildings, research, weather, workers, etc.)
 * @returns The theoretical maximum money the player could have legitimately earned
 */
export function computeMaxPossibleMoney(
  gameState: GameState,
  elapsedTicks: number,
  config: GameConfig,
): number {
  if (elapsedTicks <= 0) return gameState.money;

  // Build server-side multiplier cache using the GameConfig (Supabase-loaded).
  // This cache includes gameDefs (buildings + workers) so computeProduction,
  // computePayout, and computeEndgameIncome can resolve definitions without
  // falling back to static client-side imports.
  const cache = buildMultipliersServer(gameState, config);

  // ── 1. Endgame passive income (per tick, direct money) ──────────────
  const endgame = computeEndgameIncome(gameState, cache);
  let maxMoneyPerTick = endgame.moneyPerTick;

  // ── 2. Payout income (per cycle → convert to per-tick) ──────────────
  const payout = computePayout(gameState, cache);
  const payoutInterval = gameState.payoutConfig?.basePayoutInterval ?? 100;
  maxMoneyPerTick += payout.amountPerCycle / Math.max(1, payoutInterval);

  // ── 3. Resource production value (per tick, conservative floor) ─────
  // computeProduction returns resource outputs (iron, copper, etc.), not
  // money. We value each output unit at ≥1 money as a conservative floor.
  // This catches cases where a cheater inflates resources and then sells them.
  //
  // Use infinite available resources so all factories pass the canProduce
  // input-availability check (we want the MAX, not what's currently possible).
  const infiniteResources: Record<string, number> = {};
  for (const key of Object.keys(gameState.resources)) {
    infiniteResources[key] = Infinity;
  }

  for (const building of gameState.buildings) {
    const def = config.buildings[building.type];
    if (!def || !building.active) continue;

    const result = computeProduction(building, cache, infiniteResources);
    if (!result.canProduce) continue;

    // Conservative: each resource output unit is worth at least 1 money
    const outputValue = result.outputs.reduce((sum, o) => sum + o.amount, 0);
    maxMoneyPerTick += outputValue;
  }

  // ── Safety margin ───────────────────────────────────────────────────
  // 10% buffer to prevent false positives from floating-point rounding,
  // tick-alignment edge cases, and payout-cycle boundaries.
  const safetyMargin = 1.1;

  return gameState.money + maxMoneyPerTick * elapsedTicks * safetyMargin;
}

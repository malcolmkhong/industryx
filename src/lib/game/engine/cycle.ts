/**
 * Market Cycle Engine
 *
 * Industry-standard: pure functions for market cycle phase transitions
 * and global price multiplier interpolation.
 *
 * NO I/O. NO side effects. NO Math.random().
 */

import type { CyclePhase, MarketCycle } from './types';
import { PHASE_DURATIONS, PHASE_MULTIPLIERS } from './types';

const NEXT_PHASE: Record<CyclePhase, CyclePhase> = {
  expansion: 'peak',
  peak: 'recession',
  recession: 'recovery',
  recovery: 'expansion',
};

/**
 * Advance the market cycle by one simulation step (5 ticks).
 * Returns the new cycle state with updated phase + globalMultiplier.
 */
export function advanceCycle(currentCycle: MarketCycle, ticksInPhase: number): {
  cycle: MarketCycle;
  ticksInPhase: number;
} {
  const newTicks = ticksInPhase + 5;
  const [minDur, maxDur] = PHASE_DURATIONS[currentCycle.phase];
  const phaseDuration = (minDur + maxDur) / 2;
  const phaseProgress = Math.min(1, newTicks / phaseDuration);

  if (phaseProgress >= 1) {
    const nextPhase = NEXT_PHASE[currentCycle.phase];
    return {
      cycle: {
        phase: nextPhase,
        phaseProgress: 0,
        globalMultiplier: PHASE_MULTIPLIERS[nextPhase],
      },
      ticksInPhase: 0,
    };
  }

  // Interpolate multiplier toward target
  const target = PHASE_MULTIPLIERS[currentCycle.phase];
  const current = currentCycle.globalMultiplier;
  return {
    cycle: {
      ...currentCycle,
      phaseProgress,
      globalMultiplier: current + (target - current) * 0.02,
    },
    ticksInPhase: newTicks,
  };
}

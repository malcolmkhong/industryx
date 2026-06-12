// ============================================
// Named Selectors: Workers
// ============================================
//
// Worker assignment and efficiency selectors.
// ============================================

import type { GameState, Worker } from '../types';

// --- Raw access ---

export const selectWorkers = (s: GameState) => s.workers;

// --- Counting selectors ---

export const selectWorkerCount = (s: GameState): number => s.workers.length;

export const selectAssignedWorkerCount = (s: GameState): number =>
  s.workers.filter(w => w.assignedTo !== null).length;

export const selectUnassignedWorkerCount = (s: GameState): number =>
  s.workers.filter(w => w.assignedTo === null).length;

// --- Filter selectors ---

/** Workers assigned to a specific building instance. */
export const selectWorkersAssignedTo = (buildingId: string) => (s: GameState): Worker[] =>
  s.workers.filter(w => w.assignedTo === buildingId);

/** Workers of a specific type. */
export const selectWorkersByType = (type: Worker['type']) => (s: GameState): Worker[] =>
  s.workers.filter(w => w.type === type);

/** Unassigned workers. */
export const selectUnassignedWorkers = (s: GameState): Worker[] =>
  s.workers.filter(w => w.assignedTo === null);

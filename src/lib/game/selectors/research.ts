// ============================================
// Named Selectors: Research
// ============================================
//
// Research progress and completion selectors.
// ============================================

import type { GameState } from '../types';

// --- Raw access ---

export const selectResearchPoints = (s: GameState) => s.researchPoints;
export const selectCompletedResearch = (s: GameState) => s.completedResearch;
export const selectActiveResearch = (s: GameState) => s.activeResearch;
export const selectResearchProgress = (s: GameState) => s.researchProgress;

// --- Computed selectors ---

/** Is the given research id completed? */
export const selectIsResearchCompleted = (id: string) => (s: GameState): boolean =>
  s.completedResearch.includes(id);

/** Is the given research id currently active? */
export const selectIsResearchActive = (id: string) => (s: GameState): boolean =>
  s.activeResearch === id;

/** Research progress as percentage (0-100). */
export const selectResearchProgressPercent = (s: GameState): number =>
  Math.min(100, s.researchProgress * 100);

/** Has any research been completed? */
export const selectHasAnyResearch = (s: GameState): boolean =>
  s.completedResearch.length > 0;

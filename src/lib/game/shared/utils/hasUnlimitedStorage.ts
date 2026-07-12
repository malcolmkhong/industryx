/**
 * utils/hasUnlimitedStorage.ts — Check if unlimited storage is unlocked
 *
 * Extracted from store.ts top-level functions.
 * Zero Zustand dependencies.
 */

import type { MegaProjectBonusType } from '@/lib/game/shared/types/types';

/**
 * Check if unlimited storage is unlocked via completed mega project.
 */
export function hasUnlimitedStorage(
  megaProjects: { completed: boolean; bonus: { type: MegaProjectBonusType } }[],
): boolean {
  return megaProjects.some(p => p.completed && p.bonus.type === 'unlimitedStorage');
}

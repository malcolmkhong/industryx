// ============================================
// Cloud Sync — Detect Conflict
// ============================================
//
// Pure utility for conflict heuristic. In this codebase, the cloud
// is always authoritative after first migration (see Phase 02.2
// STATE_VERSION_CONFLICT flow), so this is now a thin shim that
// returns a ConflictInfo for display purposes. Kept as a separate
// file for future extensibility (e.g., manual conflict resolution
// UI in admin panel).
// ============================================

import type { ConflictInfo } from './types';

export interface CloudDataForDetection {
  gameTick?: number;
  money?: number;
}

/**
 * Build a ConflictInfo from local + cloud state. Always returns a
 * populated ConflictInfo even when only one side has data — callers
 * can decide what to do with it (e.g., display a summary).
 */
export function detectConflict(
  localTick: number,
  localMoney: number,
  cloudData: CloudDataForDetection | null | undefined
): ConflictInfo {
  return {
    localTick,
    localMoney,
    cloudTick: cloudData?.gameTick ?? 0,
    cloudMoney: cloudData?.money ?? 0,
  };
}

/**
 * Heuristic: does the local state appear to be ahead of the cloud
 * (e.g., offline progress was made)? Used to decide whether to prompt
 * the user. After Phase 02.2 migration, cloud always wins, so this
 * returns false unless cloud is empty.
 */
export function localIsAhead(
  localTick: number,
  localMoney: number,
  cloudData: CloudDataForDetection | null | undefined
): boolean {
  if (!cloudData || cloudData.gameTick === undefined || cloudData.gameTick === 0) {
    return false; // cloud is empty, no conflict to detect
  }
  return localTick > (cloudData.gameTick ?? 0) || localMoney > (cloudData.money ?? 0);
}

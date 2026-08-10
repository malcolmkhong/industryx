// ============================================
// initialServerStateLoader.client.ts
//
// Client-only cache accessor for the canonical initial ServerGameData
// from the server. The data is no longer fetched directly from
// /api/game/state/initial (that route is now a thin wrapper delegating
// to /api/auth/bootstrap, per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §18).
// Instead, AuthProvider.applyServerState() caches the bootstrap
// gameState here on every successful bootstrap. This module re-reads
// the cache when the store asks for the initial state.
//
// Phase 13 contract (unchanged):
//   - Returns PURE ServerGameData (never GameState — UI never crosses
//     the network boundary).
//   - On cache miss, returns null and logs. Caller decides retry policy.
// ============================================

import type { ServerGameData } from "../shared/types/types";

/**
 * Module-level cache populated by the orchestrator's applyServerState
 * (POST /api/auth/bootstrap response). Bootstrap response now carries
 * the canonical gameState per plan §4, so the dedicated
 * /api/game/state/initial fetch is redundant.
 */
let _cached: ServerGameData | null = null;

/**
 * Called by AuthProvider on every successful bootstrap response so
 * `hydrateInitialStateFromServer` can return the value without an
 * independent network call. The canonical endpoint stays mounted for
 * legacy callers but is no longer hit from this path.
 */
export function setCanonicalInitialState(state: ServerGameData | null): void {
  _cached = state;
}

/**
 * Fetch the canonical initial state. Called by
 * AuthProvider.onReady BEFORE cloud sync load so that guests without
 * a cloud row still see a populated UI.
 *
 * Reads from the orchestrator-populated cache. If the orchestrator
 * has not populated the cache yet (e.g. early mount), returns null
 * and the caller falls back to its own retry policy.
 */
export async function hydrateInitialStateFromServer(): Promise<ServerGameData | null> {
  if (!_cached) {
    console.warn(
      "[hydrateInitialStateFromServer] cache miss — orchestrator has not populated the canonical state yet",
    );
  }
  return _cached;
}

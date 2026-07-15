// ============================================
// initialServerStateLoader.client.ts
//
// Client-only fetcher for the canonical initial ServerGameData from
// the server. Network wrapper around GET /api/game/state/initial.
// Lives next to the store because the store is the only caller.
//
// Phase 13 contract:
//   - Returns PURE ServerGameData (never GameState — UI never crosses
//     the network boundary).
//   - On failure, returns null and logs. Caller decides retry policy.
//   - `cache: "no-store"` — initial state must always be fresh.
// ============================================

import type { ServerGameData } from "../shared/types/types";

/**
 * Fetch the canonical initial state from the server. Called by
 * AuthProvider.onReady BEFORE cloud sync load so that guests without
 * a cloud row still see a properly populated UI.
 *
 * Returns the raw ServerGameData response for callers who want to
 * inspect it. The wrapping with UISessionState happens in the store
 * via mergeCanonicalWithUI() — NOT here. This function returns PURE
 * server data so the split is visible at every layer.
 *
 * Failure is logged; the store remains in stub-empty / hydrated:false
 * state and the caller decides whether to retry.
 */
export async function hydrateInitialStateFromServer(): Promise<ServerGameData | null> {
  try {
    const res = await fetch("/api/game/state/initial", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `[hydrateInitialStateFromServer] HTTP ${res.status} ${res.statusText}`,
      );
      return null;
    }
    const body = (await res.json()) as { initialState?: ServerGameData };
    if (!body.initialState) {
      console.warn("[hydrateInitialStateFromServer] empty response");
      return null;
    }
    return body.initialState;
  } catch (err) {
    console.error("[hydrateInitialStateFromServer] fetch failed:", err);
    return null;
  }
}

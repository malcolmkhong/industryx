"use client";

/**
 * useOrchestratorStatus — consumes the orchestrator's current state from
 * React. The orchestrator's `state.status` drives the bootstrap flow:
 *
 *   idle                no bootstrap started yet (initial render)
 *   resolving_session   waiting for Supabase getSession
 *   bootstrapping       POST /api/auth/bootstrap in flight
 *   ready               valid identity, game state applied
 *   conflict            account conflict requires user resolution
 *   recovery_required   unsafe save state — manual support needed
 *   temporary_error     retryable bootstrap error
 *   signed_out          brief transition state after sign-out click
 *
 * Returns the live orchestrator state. Re-renders the consumer on every
 * state transition so the UI can swap between full-screen screens
 * (loading / error / conflict / recovery) and the main game shell.
 *
 * Decoupled from `useAuth()` so consumers that don't need user/session
 * don't pay the cost of mirroring them into local state.
 */

import { useContext, useSyncExternalStore } from "react";

import { AuthOrchestratorContext } from "./AuthContext";
import type { OrchestratorState } from "./types";

export interface UseOrchestratorStatusResult {
  state: OrchestratorState;
}

/**
 * Subscribe to orchestrator state changes via `useSyncExternalStore`. The
 * orchestrator is an external store from React's perspective — it
 * notifies subscribers via `subscribe()`, and provides a stable `getState`.
 *
 * Safe to call multiple times in the same tree — React deduplicates the
 * subscription per component.
 */
export function useOrchestratorStatus(): UseOrchestratorStatusResult {
  const ctx = useContext(AuthOrchestratorContext);
  if (!ctx) {
    throw new Error(
      "useOrchestratorStatus must be used within AuthOrchestratorProvider",
    );
  }
  // useSyncExternalStore wants (subscribe, getSnapshot, getServerSnapshot).
  // The orchestrator IS the store; on the server we return a safe idle
  // default to avoid hydration mismatches (orchestrator state is empty
  // until AuthProvider's useEffect attaches deps and runs startup()).
  const state = useSyncExternalStore<OrchestratorState>(
    ctx.orchestrator.subscribe.bind(ctx.orchestrator),
    ctx.orchestrator.getState.bind(ctx.orchestrator),
    () => ctx.orchestrator.getState(),
  );
  return { state };
}
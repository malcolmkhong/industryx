/**
 * orchestrator/registry — module-level reference to the live AuthOrchestrator.
 *
 * Lets non-React code (game store, action handlers, custom event listeners)
 * read the orchestrator's state without going through useAuth(). The hook
 * `useAuth` is React-only; this registry is the plain-TS equivalent.
 *
 * Single owner: AuthProvider calls `registerOrchestrator(orchestrator)` once
 * on mount. Reading via `getOrchestratorStateSnapshot()` returns a plain
 * object snapshot — safe to read from anywhere, no React context required.
 *
 * Not React-aware: the snapshot does NOT trigger re-renders. Callers that
 * need re-render should use `useAuth()` instead. This is for one-shot
 * reads inside event handlers / action bodies.
 */

import type { AuthOrchestrator } from "./AuthOrchestrator";

let _instance: AuthOrchestrator | null = null;

export function registerOrchestrator(orchestrator: AuthOrchestrator): void {
  _instance = orchestrator;
}

export function unregisterOrchestrator(orchestrator: AuthOrchestrator): void {
  if (_instance === orchestrator) {
    _instance = null;
  }
}

/**
 * Returns a snapshot of the orchestrator's current state. Falls back to a
 * "not limited" default if the orchestrator hasn't been registered yet
 * (e.g., during SSR or before AuthProvider mounts). This fail-open behavior
 * is correct for `gateIfLimited()`: if we can't read the state, don't
 * block the action — the user just gets a normal experience.
 */
export function getOrchestratorStateSnapshot() {
  if (!_instance) {
    return {
      limitedMode: false,
      limitedReason: null,
    };
  }
  const s = _instance.getState();
  return {
    limitedMode: s.limitedMode,
    limitedReason: s.limitedReason,
  };
}

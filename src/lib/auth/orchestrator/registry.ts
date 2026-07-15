/**
 * orchestrator/registry — PR4-4A.
 *
 * Module-level reference to the live AuthOrchestrator. Lets non-React code
 * (game store, action handlers, custom event listeners) read the
 * orchestrator's state without going through `useAuth()`.
 *
 * Single owner: `AuthProvider` (PR4-4B) calls `registerOrchestrator()` once
 * on mount. Reading via `getOrchestratorStateSnapshot()` returns a plain
 * object snapshot — safe to read from anywhere, no React context required.
 *
 * Not React-aware: the snapshot does NOT trigger re-renders. Callers that
 * need re-render should use `useAuth()` instead. This is for one-shot
 * reads inside event handlers / action bodies.
 *
 * The snapshot returns the new plan §5 surface: status + result payload
 * + identity + userId. The legacy `limitedMode` / `limitedReason` fields
 * are preserved so `FingerprintUnavailableModal` keeps reading the right
 * values until PR4-4B migrates it to `result.status`.
 */

import type { AuthOrchestrator } from "./AuthOrchestrator";
import type {
  IdentityKind,
  OrchestratorResult,
  OrchestratorStatus,
} from "./types";

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
 * safe idle default if the orchestrator hasn't been registered yet
 * (e.g., during SSR or before AuthProvider mounts). This fail-open
 * behavior is intentional for read-only callers — they shouldn't block
 * gameplay because the auth path hasn't booted yet.
 */
export function getOrchestratorStateSnapshot(): {
  status: OrchestratorStatus;
  identity: IdentityKind;
  userId: string | null;
  deviceId: string | null;
  isGuest: boolean;
  result: OrchestratorResult | null;
  limitedMode: boolean;
  limitedReason: string | null;
} {
  if (!_instance) {
    return {
      status: "idle",
      identity: "unauthenticated",
      userId: null,
      deviceId: null,
      isGuest: false,
      result: null,
      limitedMode: false,
      limitedReason: null,
    };
  }
  const s = _instance.getState();
  return {
    status: s.status,
    identity: s.identity,
    userId: s.userId,
    deviceId: s.deviceId,
    isGuest: s.isGuest,
    result: s.result,
    limitedMode: s.limitedMode,
    limitedReason: s.limitedReason,
  };
}

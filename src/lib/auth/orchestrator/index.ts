/**
 * AuthOrchestrator — public API barrel (PR4-4A).
 */

export { AuthOrchestrator } from "./AuthOrchestrator";
export {
  AuthOrchestratorProvider,
  AuthOrchestratorContext,
  type AuthContextValue,
} from "./AuthContext";
export { useAuth } from "./useAuth";
export { useOrchestratorStatus } from "./useOrchestratorStatus";
export {
  createDeviceIdStorage,
  DEVICE_ID_STORAGE_KEY,
  type DeviceIdStorage,
} from "./storage";
export {
  registerOrchestrator,
  unregisterOrchestrator,
  getOrchestratorStateSnapshot,
} from "./registry";
export {
  transition,
  responseBodyToEvent,
  type TransitionEvent,
  type TransitionEffect,
  type TransitionOutcome,
} from "./state";
export type {
  AuthEvent,
  AuthEventListener,
  AuthOrchestratorBootstrapDeps,
  BootstrapConflictResult,
  BootstrapReadyResult,
  BootstrapRecoveryResult,
  BootstrapRequestBody,
  BootstrapResponseBody,
  BootstrapSource,
  BootstrapTelemetryEvent,
  BootstrapTemporaryErrorResult,
  FingerprintStatus,
  IdentityKind,
  LimitedReason,
  OrchestratorResult,
  OrchestratorState,
  OrchestratorStatus,
  StateListener,
} from "./types";
export type { Session } from "./types";
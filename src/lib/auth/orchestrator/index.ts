/**
 * AuthOrchestrator — public API barrel.
 */

export { AuthOrchestrator } from './AuthOrchestrator';
export {
  AuthOrchestratorProvider,
  AuthOrchestratorContext,
  type AuthContextValue,
} from './AuthContext';
export { useAuth } from './useAuth';
export {
  createDeviceIdStorage,
  DEVICE_ID_STORAGE_KEY,
  type DeviceIdStorage,
} from './storage';
export type {
  AuthEvent,
  AuthEventListener,
  AuthOrchestratorDeps,
  GameTab,
  IdentityKind,
  LoginPromptReason,
  OrchestratorState,
  OrchestratorStatus,
  StateListener,
} from './types';
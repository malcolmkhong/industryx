// ============================================
// FACTORY DOMINION: STORE BOOTSTRAP
// Compatibility barrel. Initial state logic lives in focused modules.
// ============================================

export {
  createStubInitialState,
  createStubServerData,
  createStubUISessionState,
  mergeCanonicalWithUI,
} from "./initialClientState";
export { hydrateInitialStateFromServer } from "./initialServerStateLoader.client";

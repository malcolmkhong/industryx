/**
 * limitedMode — gate for action handlers in limited-connection mode.
 *
 * When the orchestrator is in `limitedMode` with reason
 * `fingerprint_unavailable`, server-side actions (build, buy, sell, etc.)
 * would silently fail (or worse, succeed locally and diverge from server
 * state). Instead, we block them client-side and re-show the modal so
 * the user knows they need to fix the fingerprint or sign in.
 *
 * Usage in an action handler:
 *
 *   async function build(...) {
 *     if (gateIfLimited()) return;  // action blocked, modal will re-show
 *     // ... existing logic ...
 *   }
 *
 * Implementation: a custom DOM event ("force-show-limited-modal") is
 * dispatched on the window. The FingerprintUnavailableModal listens for
 * it and re-shows itself. This avoids a circular import between the
 * game store and the modal's component tree.
 */

import { getOrchestratorStateSnapshot } from "@/lib/auth/orchestrator/registry";

export const FORCE_SHOW_LIMITED_MODAL_EVENT = "force-show-limited-modal";

/**
 * If the user is in limited mode, dispatch a "force-show" event so the
 * modal re-appears, and return true. Otherwise return false (the action
 * is safe to proceed).
 *
 * Safe to call from SSR / server contexts (no-op when window is absent).
 * Safe to call before AuthProvider mounts (returns false — action proceeds).
 */
export function gateIfLimited(): boolean {
  if (typeof window === "undefined") return false;
  const { limitedMode, limitedReason } = getOrchestratorStateSnapshot();
  if (!limitedMode || limitedReason !== "fingerprint_unavailable") {
    return false;
  }
  window.dispatchEvent(new CustomEvent(FORCE_SHOW_LIMITED_MODAL_EVENT));
  return true;
}

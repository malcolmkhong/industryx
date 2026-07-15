// ============================================
// IndustriaX: Balance polling timer — own BalancePollState + start/stop helpers.
// Behavior-preserving split of the original configLoader.server.ts.
// Owns: BalancePollState (private), balanceState (private), startBalancePoller(),
// stopBalancePoller(), __resetBalancePollerForTests(), markBalancePrimed()
// (bridge exposed for balanceLoader.refreshBalanceFromSupabase).
// ============================================

import { BALANCE_POLL_INTERVAL_MS } from "./loaderTypes";
import { refreshBalanceFromSupabase } from "./balanceLoader";

interface BalancePollState {
  /** setInterval handle (null when not polling). */
  timer: ReturnType<typeof setInterval> | null;
  /** Whether the poller has done at least one full fetch. */
  primed: boolean;
}

const balanceState: BalancePollState = {
  timer: null,
  primed: false,
};

/**
 * Mark the balance poller as primed after a successful refresh.
 * Called by `refreshBalanceFromSupabase` so that the polling-timer module
 * remains the sole owner of `balanceState`.
 */
export function markBalancePrimed(): void {
  balanceState.primed = true;
}

/**
 * Start the 60s polling timer. Idempotent — calling twice is a no-op.
 * Returns a function that stops the poller (useful for tests).
 */
export function startBalancePoller(): () => void {
  if (balanceState.timer) {
    return () => stopBalancePoller();
  }
  balanceState.timer = setInterval(() => {
    void refreshBalanceFromSupabase().catch((err) => {
      console.warn(
        "[BalanceLoader] Poll tick failed:",
        err instanceof Error ? err.message : String(err),
      );
    });
  }, BALANCE_POLL_INTERVAL_MS);
  // Don't keep the Node.js process alive solely for this timer.
  if (typeof balanceState.timer === "object" && balanceState.timer && "unref" in balanceState.timer) {
    (balanceState.timer as { unref: () => void }).unref();
  }
  return () => stopBalancePoller();
}

export function stopBalancePoller(): void {
  if (balanceState.timer) {
    clearInterval(balanceState.timer);
    balanceState.timer = null;
  }
}

/** Test-only: reset all balance poller state. */
export function __resetBalancePollerForTests(): void {
  stopBalancePoller();
  balanceState.primed = false;
}

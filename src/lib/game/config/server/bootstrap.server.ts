// Server process bootstrap for runtime game configuration.
// Owns boot ordering only; loaders and pollers retain their own behavior.

import { ensureConfigLoaded } from "./ensureConfigLoaded";
import { startBalancePoller } from "./balancePoller";

/**
 * Pre-warm the complete server config once, then keep balance data fresh.
 * The poller starts even after a failed pre-warm so it can retry without
 * weakening fail-closed request behavior.
 */
export async function bootstrapConfigRuntime(): Promise<void> {
  console.info("[config-bootstrap] Pre-warming game config from Supabase...");
  const result = await ensureConfigLoaded();

  if (result.ok) {
    console.info("[config-bootstrap] Game config pre-warmed successfully");
  } else {
    console.warn(
      "[config-bootstrap] Game config pre-warm FAILED - " +
        (result.error ?? "unknown reason") +
        ". Server will retry on first config-dependent request.",
    );
  }

  try {
    startBalancePoller();
    console.info("[config-bootstrap] Balance poller started (60s interval)");
  } catch (err) {
    console.warn(
      "[config-bootstrap] Balance poller setup FAILED:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

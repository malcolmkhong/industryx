// Server process bootstrap for runtime game configuration.
// Owns boot ordering only; loaders and pollers retain their own behavior.

import { ensureConfigLoaded } from "./ensureConfigLoaded";
import { startBalancePoller } from "./balancePoller";

/**
 * Pre-warm the complete server config once, then keep balance data fresh.
 * The poller starts even after a failed pre-warm so it can retry without
 * weakening fail-closed request behavior.
 *
 * Task 6: On initial failure, retry the full pre-warm with bounded
 * exponential backoff (1s, 2s, 4s — capped at 8s, max 3 attempts). This
 * covers the cold-start window where Supabase may not be ready when the
 * Node process first boots. The TTL on `ensureConfigLoaded` is 5 minutes;
 * if we still fail after 3 attempts the server runs on data.ts defaults
 * and the poller's per-tick fetches will eventually retry.
 */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function bootstrapConfigRuntime(): Promise<void> {
  // Use console.log instead of console.info — Next.js dev mode sometimes
  // silences info-level output for stdout buffering, while warn/error
  // and plain log always surface. Keeping both lines visible makes the
  // boot sequence auditable from the terminal.
  console.log("[config-bootstrap] Pre-warming game config from Supabase...");
  let result = await ensureConfigLoaded();
  let attempt = 0;

  while (!result.ok && attempt < RETRY_DELAYS_MS.length) {
    const delay = RETRY_DELAYS_MS[attempt];
    console.warn(
      `[config-bootstrap] Pre-warm attempt ${attempt + 1} failed (${
        result.error ?? "unknown reason"
      }). Retrying in ${delay}ms...`,
    );
    await sleep(delay);
    attempt += 1;
    result = await ensureConfigLoaded();
  }

  if (result.ok) {
    console.log(
      `[config-bootstrap] Game config pre-warmed successfully${
        attempt > 0 ? ` after ${attempt + 1} attempts` : ""
      }`,
    );
  } else {
    console.warn(
      `[config-bootstrap] Game config pre-warm FAILED after ${
        attempt + 1
      } attempts - ${
        result.error ?? "unknown reason"
      }. Server will retry on first config-dependent request.`,
    );
  }

  try {
    startBalancePoller();
    console.log("[config-bootstrap] Balance poller started (60s interval)");
  } catch (err) {
    console.warn(
      "[config-bootstrap] Balance poller setup FAILED:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

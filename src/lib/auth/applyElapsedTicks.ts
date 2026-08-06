// ============================================
// applyElapsedTicks.ts — Phase 7 server tick injection.
//
// Server owns game time. Every authoritative action endpoint calls this
// helper BEFORE running its action handler. The helper:
//
//   1. Reads the authoritative server timestamp via the `now_iso()` RPC
//      (Postgres CURRENT_TIMESTAMP, immune to Node clock drift).
//   2. Loads the current GameConfig from Supabase (cached after first load).
//   3. Computes `elapsed_ticks = floor(elapsed_seconds * game_speed)`,
//      capped by MAX_TICK_RATE_PER_SECOND to prevent runaway catch-up.
//   4. If elapsed > 0, calls `runServerTicks()` server-side to advance
//      resources/money/buildings/gameTick by the elapsed amount.
//   5. Returns the post-tick state for the caller to use in the same
//      transaction.
//
// This replaces per-second client tick loops. The client no longer mutates
// game state on its own clock; it only renders.
//
// See docs/REFACTOR_SERVER_AUTHORITATIVE_ACTIONS.md Phase 7 for the design.
// ============================================

import { getDbClient } from '@/lib/db/access';
import { fetchGameConfigFromSupabase } from "@/lib/db/config/serverConfigFetcher";
import { runServerTicks } from "@/lib/game/production/engine/serverEngine.server";
import { getGameLimits } from "@/lib/game/config/balance/balanceConfig";
import { ensureConfigLoaded } from "@/lib/game/config/server/configLoader.server";
import { getServerNowISO } from "@/lib/auth/serverTime";
import type { ServerGameData } from "@/lib/game/shared/types/types";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";

interface ApplyElapsedResult {
  /**
   * Updated state after applying elapsed ticks. Caller should use this in
   * place of `state.full_state` for any subsequent read or action.
   * Phase 13: returns pure ServerGameData (no UI flags).
   */
  state: ServerGameData;
  /**
   * Number of ticks actually applied (may be 0 if no time elapsed or
   * upstream call capped). For audit logging.
   */
  elapsedTicks: number;
  /**
   * Authoritative server timestamp (Postgres CURRENT_TIMESTAMP via
   * now_iso()). Caller should use this for `last_tick_at` persistence.
   */
  serverNow: string;
  /**
   * ProductionSnapshot for the post-tick state. `null` when no ticks
   * were applied (no new authoritative snapshot to install). Surface to
   * the client so UI consumers can refresh rates alongside `newState`.
   *
   * Phase 13 invariant preserved: snapshot stays a response/UI value and
   * is NEVER persisted inside `full_state`.
   */
  productionSnapshot: ProductionSnapshot | null;
}

/**
 * Compute elapsed ticks between `last_tick_at` and authoritative server
 * now, then apply those ticks via `runServerTicks()`. Returns the
 * post-tick state.
 *
 * Phase 13: input/output is pure ServerGameData. No UI fields are
 * tracked or propagated here. UI stays on the client.
 *
 * Fail-closed: any DB or config error throws. The caller MUST surface
 * that as an error response (5xx); do not silently proceed with stale
 * state.
 */
export async function applyElapsedTicks(
  currentState: ServerGameData,
  lastTickAt: string | null,
  gameSpeed: number,
): Promise<ApplyElapsedResult> {
  // Pre-condition: balance config must be loaded from DB before reading
  // getGameLimits(). In practice the route handler already calls
  // ensureConfigLoaded() before this function, but we call it again here
  // for defense in depth (e.g., direct test invocations).
  const balanceLoad = await ensureConfigLoaded();
  if (!balanceLoad.ok) {
    throw new Error(
      `[applyElapsedTicks] Balance config unavailable: ${balanceLoad.error ?? "unknown"}. ` +
        `Per RULES.md [SEC-002]: refuse to proceed.`,
    );
  }

  const configResult = await fetchGameConfigFromSupabase();
  if (!configResult.config) {
    throw new Error(
      `[applyElapsedTicks] Config unavailable: ${configResult.partialErrors.join(", ") || "unknown"}`,
    );
  }
  const config = configResult.config;

  const supabase = getDbClient();
  if (!supabase) {
    throw new Error("[applyElapsedTicks] Supabase service role not configured");
  }

  // Centralized time-source helper (audit 2026-07-15, BUG-074). The helper
  // throws on any RPC error so we never silently fall back to Node clock.
  // Previously this branch had its own inline now_iso RPC call plus
  // a Node-clock fallback elsewhere in the codebase; both have been
  // collapsed to this single delegated read.
  const serverNow = await getServerNowISO(supabase);

  // No prior tick timestamp → assume brand-new state. Do not apply ticks;
  // caller will initialize.
  if (!lastTickAt) {
    return { state: currentState, elapsedTicks: 0, serverNow, productionSnapshot: null };
  }

  const serverNowMs = new Date(serverNow).getTime();
  const lastTickMs = new Date(lastTickAt).getTime();
  if (Number.isNaN(serverNowMs) || Number.isNaN(lastTickMs)) {
    throw new Error(
      `[applyElapsedTicks] Invalid timestamp format: serverNow=${serverNow}, lastTickAt=${lastTickAt}`,
    );
  }

  const elapsedSeconds = Math.max(0, (serverNowMs - lastTickMs) / 1000);
  // V-031 (PR-BP-3): fail-closed on invalid game speed. Previously the
  // helper silently clamped `gameSpeed <= 0 || NaN || Infinity` to `1`,
  // which masked data corruption in `server_game_state.game_speed` and
  // produced incorrect tick counts (and downstream resource drift) on
  // rows whose speed column had drifted to a bad value. Per RULES.md
  // "fail-closed on auth, config, validation, rate-limit, server, and
  // database errors", we now throw so the caller returns 503.
  if (!Number.isFinite(gameSpeed) || gameSpeed <= 0) {
    throw new RangeError(
      `[applyElapsedTicks] Invalid game speed: ${gameSpeed}. ` +
        `Per RULES.md [SEC-002]: refuse to proceed.`,
    );
  }
  const safeGameSpeed = gameSpeed;
  const elapsedTicks = Math.min(
    getGameLimits().maxTickRatePerSecond,
    Math.floor(elapsedSeconds * safeGameSpeed),
  );

  if (elapsedTicks <= 0) {
    return { state: currentState, elapsedTicks: 0, serverNow, productionSnapshot: null };
  }

  const result = runServerTicks(currentState, elapsedTicks, config);
  return {
    state: result.newState,
    elapsedTicks,
    serverNow,
    productionSnapshot: result.productionSnapshot,
  };
}

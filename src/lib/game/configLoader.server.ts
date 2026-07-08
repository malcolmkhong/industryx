// ============================================
// IndustryaX: Server-Side Config Loader
// Loads GameConfig from Supabase into the in-process configCache
// so that cron validators / API routes see the same data the client sees.
//
// Architecture (P1.2 of the data.ts → Supabase refactor):
//
//   ┌────────────────────────────┐
//   │ Supabase (game_config_*)   │
//   └─────────────┬──────────────┘
//                 │  fetchGameConfigFromSupabase()
//                 ▼
//   ┌────────────────────────────┐
//   │ configLoader.server.ts     │ ← THIS FILE
//   │ ensureConfigLoaded()       │
//   └─────────────┬──────────────┘
//                 │  updateFromSupabase()
//                 ▼
//   ┌────────────────────────────┐
//   │ configCache.ts (let-bound) │
//   │   BUILDING_DEFS,           │
//   │   RESEARCH_TREE, ...       │
//   └─────────────┬──────────────┘
//                 │  read by:
//                 ▼
//   ┌────────────────────────────────────────────┐
//   │ - /api/cron/validate-ticks                 │
//   │ - /lib/auth/gameStateValidator (whitelist) │
//   │ - /lib/auth/guestMigrationValidator       │
//   └────────────────────────────────────────────┘
//
// Server-authoritative behavior:
// - The first call from any consumer triggers a single fresh load.
// - Concurrent callers share the same promise (no thundering herd).
// - Subsequent calls within TTL return the cached promise immediately.
// - If Supabase returns critical failure (buildings/resources/recipes),
//   configSource stays 'local' and lastError is set so callers can
//   fail-closed if they care.
// - NEVER throws: returns `{ ok, source, error }` and lets callers decide.
// ============================================

import {
  updateFromSupabase,
  configSource as _liveConfigSource,
} from "@/lib/game/configCache";
import {
  applyBalanceOverrides,
  validateBalanceOverrides,
} from "@/lib/game/balanceConfig";
import { fetchGameConfigFromSupabase } from "@/lib/db/serverConfigFetcher";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Cache TTL — same as the client-side provider (5 minutes)
const CONFIG_LOADER_TTL_MS = 5 * 60 * 1000;

interface LoaderState {
  /** In-flight or completed load promise. Shared across callers. */
  promise: Promise<LoadResult> | null;
  /** When the load completed (used for TTL). 0 = not loaded yet. */
  loadedAt: number;
  /** Result of the most recent load attempt. */
  lastResult: LoadResult | null;
}

export interface LoadResult {
  /** Whether Supabase data is now bound into configCache (true) or we fell back to data.ts defaults (false). */
  ok: boolean;
  /** 'supabase' after a successful load, 'local' otherwise. */
  source: "supabase" | "local";
  /** Per-table error messages (only set when ok=false because of partial errors). */
  partialErrors: string[];
  /** Critical failure reason (only set when ok=false). */
  error?: string;
}

let state: LoaderState = {
  promise: null,
  loadedAt: 0,
  lastResult: null,
};

/**
 * Ensure configCache is loaded with fresh Supabase data.
 *
 * - Idempotent: concurrent calls share the same in-flight promise.
 * - Lazy: the very first call kicks off the load. Server boot does not
 *   trigger it — config loads on first validator invocation.
 * - TTL-bound: after CONFIG_LOADER_TTL_MS, the next call re-fetches.
 *
 * Returns a result describing whether Supabase data is active. Never throws.
 *
 * SECURITY/FAIL-CLOSED NOTE:
 * If `ok === false`, callers that depend on accurate game definitions
 * (cron anti-cheat, save validators) MUST refuse to proceed. Letting
 * them run against data.ts defaults during a Supabase outage would
 * silently weaken anti-cheat.
 */
export async function ensureConfigLoaded(): Promise<LoadResult> {
  const now = Date.now();

  // Cache hit — TTL not expired, previous attempt already known
  if (state.lastResult && now - state.loadedAt < CONFIG_LOADER_TTL_MS) {
    return state.lastResult;
  }

  // Cache hit — in-flight promise exists; share it
  if (state.promise) {
    return state.promise;
  }

  // Cache miss — kick off a fresh load
  state.promise = (async (): Promise<LoadResult> => {
    try {
      const result = await fetchGameConfigFromSupabase();

      if (result.config) {
        // Pipe into the existing configCache (live bindings propagate
        // automatically to all consumers).
        updateFromSupabase(result.config);

        // Apply any balancing-rule overrides from Supabase.
        // NOTE: Today this is a no-op (empty override object keeps DEFAULT_BALANCE).
        // Future versions can populate `balanceOverrides` from
        // `result.config.balancingRules` once the multiplier → field mapping
        // is designed (see RULES.md / TODOs). Wiring it here means the call
        // site exists and any future change is one-line instead of touching
        // every entry point.
        const balanceOverrides: Record<string, unknown> = {};
        applyBalanceOverrides(balanceOverrides);

        const ok = true;
        const loadResult: LoadResult = {
          ok,
          source: "supabase",
          partialErrors: result.partialErrors,
        };
        state.lastResult = loadResult;
        state.loadedAt = Date.now();

        if (result.partialErrors.length > 0) {
          console.warn(
            "[ConfigLoader] Loaded from Supabase with partial errors:",
            result.partialErrors,
          );
        } else {
          console.info("[ConfigLoader] Config loaded from Supabase OK");
        }
        return loadResult;
      }

      // Critical Supabase failure — leave configCache on empty defaults.
      // (post data.ts deletion, BUILDING_DEFS etc. start as empty objects.)
      const partialErrors = result.partialErrors;
      const error =
        partialErrors[partialErrors.length - 1] ||
        "Supabase returned no config (critical tables missing)";
      console.error(
        "[ConfigLoader] CRITICAL: Supabase config unavailable. " +
          "configCache remains on data.ts defaults. Caller must fail closed.",
        partialErrors,
      );

      const loadResult: LoadResult = {
        ok: false,
        source: "local",
        partialErrors,
        error,
      };
      state.lastResult = loadResult;
      state.loadedAt = Date.now();
      return loadResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ConfigLoader] Unexpected error:", message);
      const loadResult: LoadResult = {
        ok: false,
        source: "local",
        partialErrors: [],
        error: message,
      };
      state.lastResult = loadResult;
      state.loadedAt = Date.now();
      return loadResult;
    } finally {
      // Clear in-flight so the next TTL window can re-fire a fresh load
      state.promise = null;
    }
  })();

  return state.promise;
}

/**
 * Synchronous probe — returns the current source tag without triggering a load.
 * Useful for hot paths that need to fail-closed if Supabase is not bound yet.
 *
 * Returns 'supabase' if `ensureConfigLoaded` has succeeded at least once
 * within the current TTL window. Returns 'local' otherwise (cold start OR
 * Supabase down).
 */
export function getActiveConfigSource(): "supabase" | "local" {
  return _liveConfigSource as "supabase" | "local";
}

/**
 * Test-only helper — reset the loader so the next call re-fetches.
 * NOT exported from the public API; used by integration tests.
 */
export function __resetConfigLoaderForTests(): void {
  state = { promise: null, loadedAt: 0, lastResult: null };
}

// ─── Balance Config Polling (Phase 2) ──────────────────────────────────
// Hot-reloads balance config from Supabase every BALANCE_POLL_INTERVAL_MS.
// Uses incremental fetch: only rows where updated_at > lastSeen[key] are
// pulled. Failures keep the previous in-memory values (never throws).

export const BALANCE_POLL_INTERVAL_MS = 60_000;

interface BalancePollState {
  /** Per-key last-seen timestamp (ms since epoch). */
  lastSeen: Map<string, number>;
  /** setInterval handle (null when not polling). */
  timer: ReturnType<typeof setInterval> | null;
  /** Whether the poller has done at least one full fetch. */
  primed: boolean;
}

const balanceState: BalancePollState = {
  lastSeen: new Map<string, number>(),
  timer: null,
  primed: false,
};

interface BalanceRow {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

/**
 * Fetch balance rows changed since lastSeen. Always returns a fresh result.
 * Fail-closed: DB failure → return null, caller keeps previous values.
 */
export async function loadBalanceFromSupabase(): Promise<BalanceRow[] | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    console.warn("[BalanceLoader] No service-role client available");
    return null;
  }
  try {
    let query = supabase
      .from("game_config_balance")
      .select("key, value, updated_at");
    if (balanceState.primed && balanceState.lastSeen.size > 0) {
      // Fetch rows newer than the oldest lastSeen. Cheap because the
      // lastSeen map has ~15 entries; the OR filter is fine for that.
      const timestamps = Array.from(balanceState.lastSeen.values()).sort((a, b) => a - b);
      const oldestTs = new Date(timestamps[0]).toISOString();
      query = query.gt("updated_at", oldestTs);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("[BalanceLoader] Supabase fetch failed:", error.message);
      return null;
    }
    return (data ?? []) as BalanceRow[];
  } catch (err) {
    console.warn(
      "[BalanceLoader] Unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Apply fetched rows to the in-process activeBalance. Each row is validated
 * before merge; invalid rows are logged and skipped (previous values kept).
 * Returns the count of rows successfully applied.
 */
export function applyFetchedBalanceRows(rows: BalanceRow[]): number {
  let applied = 0;
  const overlay: Record<string, unknown> = {};
  for (const row of rows) {
    const ts = Date.parse(row.updated_at);
    if (Number.isFinite(ts)) {
      balanceState.lastSeen.set(row.key, ts);
    }
    // Build a single-row overlay and validate; if invalid, skip the row.
    overlay[row.key] = row.value;
    const result = validateBalanceOverrides({ [row.key]: row.value });
    if (!result.valid) {
      console.warn(
        `[BalanceLoader] Skipping invalid row "${row.key}":`,
        result.errors.join("; "),
      );
      delete overlay[row.key];
      continue;
    }
    applied++;
  }
  if (applied > 0) {
    applyBalanceOverrides(overlay as Parameters<typeof applyBalanceOverrides>[0]);
    balanceState.primed = true;
  }
  return applied;
}

/**
 * Manually trigger a fetch+apply cycle. Returns true on success (any rows
 * applied OR first-prime completed). Used by instrumentation at boot AND
 * by the polling timer.
 */
export async function refreshBalanceFromSupabase(): Promise<boolean> {
  const rows = await loadBalanceFromSupabase();
  if (rows === null) return false;
  applyFetchedBalanceRows(rows);
  balanceState.primed = true;
  return true;
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
  balanceState.lastSeen.clear();
  balanceState.primed = false;
}

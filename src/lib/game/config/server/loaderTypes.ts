// ============================================
// IndustriaX: Server Config Loader — Shared Types
// Types + constants shared across the config loader sub-modules.
// Behavior-preserving split of the original configLoader.server.ts.
// ============================================

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

export interface BalanceRow {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface BalanceLoadResult {
  ok: boolean;
  /** Set when ok=false. */
  error?: string;
  /** Per-row validation errors (kept for logging). */
  errors: string[];
}

// ─── Balance Config Polling (60s) ─────────────────────────────────────────
// Hot-reloads the COMPLETE balance every BALANCE_POLL_INTERVAL_MS. Unlike
// the old incremental approach, we always re-fetch the full set: a partial
// set is a hard failure, so the new payload must be complete before it can
// replace the in-process balance. Failures keep the previous values.

export const BALANCE_POLL_INTERVAL_MS = 60_000;

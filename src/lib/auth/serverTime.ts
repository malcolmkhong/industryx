// ============================================
// serverTime.ts — single authoritative UTC clock source for server code.
//
// All server-authoritative time reads in IndustriaX MUST go through
// `getServerNowISO(supabase)`. The helper delegates to the Postgres
// `now_iso()` RPC (defined in supabase/migrations/20260615091957_now_iso_function.sql)
// which returns `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.
//
// Rationale (audit 2026-07-15, BUG-074):
//   - One global UTC clock — every player observes the same timestamp
//     via the same shared Postgres session.
//   - Eliminates Node-clock drift (containers/serverless time can swing
//     seconds to minutes from the DB clock).
//   - Eliminates the silent `new Date().toISOString()` fallback that
//     violated SEC-002 fail-closed semantics in /api/game/state/sync.
//
// Companion helpers:
//   - `compareIso` and `isExpiredIso` use pure ISO-string lexicographic
//     compare. Both sides are UTC `YYYY-MM-DDTHH:MI:SS.MS` strings, so
//     lex order is chrono order. Avoids mixing `new Date(str) < new Date()`
//     which silently accepts `Invalid Date` (NaN) and is easy to misread.
//   - `getCurrentUtcDateISO` derives YYYY-MM-DD from the same DB-anchored
//     ISO so the daily-reset boundary is identical to the tick boundary.
//
// See `docs/SERVER_TICK_CHAIN_PLAN.md` for the canonical tick chain.
// ============================================

/**
 * Minimal Supabase client shape required by the time helpers.
 *
 * We do not import the full Supabase client type here because (a) this
 * module is referenced by route handlers that may have a service-role
 * or request-scoped client, (b) keeping the surface minimal lets unit
 * tests pass a tiny fake, and (c) it documents the contract — only
 * `rpc("now_iso")` is needed.
 *
 * The `rpc` return is typed as a `PromiseLike` because the real Supabase
 * client returns a `PostgrestFilterBuilder` (thenable) rather than a
 * native `Promise`. `await`-ing either is identical at runtime.
 */
export interface TimeClient {
  rpc: (
    functionName: "now_iso",
    args?: Record<string, never>,
  ) => PromiseLike<{
    data: string | null;
    error: { message: string } | null;
  }>;
}

/**
 * Read the authoritative UTC timestamp from Postgres.
 *
 * Returns the ISO string on success. On error the helper throws so the
 * caller MUST surface it as a fail-closed error (per SEC-002).
 *
 * @throws Error when `now_iso()` returns an error or null data.
 */
export async function getServerNowISO(
  supabase: TimeClient,
): Promise<string> {
  const { data, error } = await supabase.rpc("now_iso");
  if (error) {
    throw new Error(
      `[serverTime] now_iso() RPC failed: ${error.message ?? "unknown"}. ` +
        `Per RULES.md [SEC-002]: refuse to proceed.`,
    );
  }
  if (data == null || data === "") {
    throw new Error(
      `[serverTime] now_iso() returned no data. ` +
        `Per RULES.md [SEC-002]: refuse to proceed.`,
    );
  }
  return String(data);
}

/**
 * Variant that returns `string | null` instead of throwing. Use this when
 * the caller wants to decide policy (e.g., routes that translate a null
 * result into a 503 response). Prefer `getServerNowISO` for helper-level
 * code so failures fail closed at the boundary.
 */
export async function getServerNowISOOrNull(
  supabase: TimeClient,
): Promise<string | null> {
  try {
    return await getServerNowISO(supabase);
  } catch {
    return null;
  }
}

/**
 * Lexicographic compare of two UTC ISO-8601 strings.
 *
 * Both inputs MUST be UTC `YYYY-MM-DDTHH:MI:SS[.fff]Z`-shaped strings
 * with the same precision for the result to be chronologically valid.
 * Postgres `now_iso()` always returns `YYYY-MM-DD"T"HH24:MI:SS.MS"Z"`
 * so lex compare matches chronological compare.
 *
 * @returns -1 if `a < b`, 0 if equal, +1 if `a > b`.
 */
export function compareIso(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Returns true if `expiresAtIso` is strictly before `nowIso` (UTC).
 * Equal timestamps are considered NOT expired.
 *
 * Both arguments must be UTC ISO strings at the same precision.
 */
export function isExpiredIso(
  expiresAtIso: string,
  nowIso: string,
): boolean {
  return expiresAtIso < nowIso;
}

/**
 * Returns true if `validUntilIso` is strictly after `nowIso` (UTC).
 *
 * At exact equality the validity has just ended, so this returns false.
 * This is intentionally the mirror of `isExpiredIso` at strict inequality
 * (a > b is the negation of a < b), but at equality both return false —
 * i.e. the boundary is owned by the caller: a deadline reached exactly
 * at "now" is treated as "not still valid" by this helper.
 */
export function isValidUntilIso(
  validUntilIso: string,
  nowIso: string,
): boolean {
  return validUntilIso > nowIso;
}

/**
 * Derive the current UTC calendar date (YYYY-MM-DD) from the same
 * authoritative DB clock. Replaces `new Date().toISOString().split('T')[0]`
 * patterns so the daily-reset boundary is identical to the tick boundary
 * regardless of the host container's `TZ` env var.
 *
 * Returns null when the DB clock cannot be read; callers should fail
 * closed in that case.
 */
export async function getCurrentUtcDateISO(
  supabase: TimeClient,
): Promise<string | null> {
  const iso = await getServerNowISOOrNull(supabase);
  if (iso == null) return null;
  return iso.slice(0, 10);
}

/**
 * Derive the previous UTC calendar date (YYYY-MM-DD), one day earlier
 * than `getCurrentUtcDateISO`. Pure string arithmetic on the UTC anchor
 * so it does not depend on the host's local TZ.
 *
 * Returns null when the DB clock cannot be read; callers should fail
 * closed.
 */
export async function getPreviousUtcDateISO(
  supabase: TimeClient,
): Promise<string | null> {
  const today = await getCurrentUtcDateISO(supabase);
  if (today == null) return null;
  // Parse `YYYY-MM-DD` as midnight UTC, subtract 24h, slice back to date.
  // Using midnight UTC ensures DST or TZ does not shift the date.
  const ts = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
    0,
    0,
    0,
    0,
  );
  return new Date(ts - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Format a Postgres `TIMESTAMPTZ` ISO string into a UTC `YYYY-MM-DD`.
 *
 * Postgres can emit timestamps with or without `T` separator, with or
 * without fractional seconds, and with `+00` or `Z` timezone markers.
 * This helper truncates everything after the first ten characters which
 * is robust enough for date-only comparisons used by daily-rewards code.
 *
 * Does NOT call the DB — pure string transform. Callers that need the
 * "current UTC date" should use `getCurrentUtcDateISO` instead.
 */
export function toUtcDateString(timestampIso: string | null | undefined): string | null {
  if (timestampIso == null) return null;
  // Accept both "2026-07-15" and "2026-07-15T..." shapes; slice(0, 10).
  return timestampIso.slice(0, 10);
}

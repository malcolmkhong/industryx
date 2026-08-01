// ============================================
// shared/serverTime.js — Cloudflare Workers
//
// Phase 6 of the time refactor. The markettick worker no longer trusts
// Date.now() for time-sensitive writes. Every "now" used to compute ISO
// timestamps for weather transitions, market-event scheduling, and
// news-record `updated_at` columns comes from the same authoritative
// source as the Next.js routes: the Postgres `now_iso()` RPC.
//
// The Next.js side reaches Postgres via the Supabase REST `now_iso` RPC
// (see supabase/migrations/20260615091957_now_iso_function.sql). The
// worker reaches the same RPC using the same REST endpoint and its
// service-role key. The two clocks therefore agree to within one RPC
// round-trip — and because the RPC itself returns CURRENT_TIMESTAMP
// from Postgres, both sides are immune to worker/Node-clock drift.
// ============================================

/**
 * Fetch the authoritative UTC timestamp from Postgres via the
 * Supabase `now_iso` RPC. Returns the ms-since-epoch number used by
 * the worker, or `null` on any failure so callers can fail closed.
 *
 * Errors are logged with a worker-scoped tag so Cloudflare's
 * observability dashboard surfaces them. Workers should treat
 * `null` as a hard skip — never write a stale or empty timestamp.
 */
export async function fetchNowIsoMs(supabaseUrl, headers) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/now_iso`, {
      method: 'POST',
      headers: { ...headers, 'Accept': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      console.warn(
        '[serverTime] now_iso RPC failed:',
        res.status,
        res.statusText,
      );
      return null;
    }
    const data = await res.json();
    const iso = typeof data === 'string' ? data : null;
    if (!iso) {
      console.warn('[serverTime] now_iso returned empty body');
      return null;
    }
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) {
      console.warn('[serverTime] now_iso returned unparseable iso:', iso);
      return null;
    }
    return ms;
  } catch (err) {
    console.warn('[serverTime] now_iso fetch threw:', err?.message ?? err);
    return null;
  }
}
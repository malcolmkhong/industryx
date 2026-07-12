// ============================================
// Next.js Instrumentation Hook
// Runs ONCE per server instance at startup.
//
// Purpose: pre-warm the game config loader so that the FIRST request
// to a server-side validator (cron / gameStateValidator / etc.) does
// not have to wait for an in-line Supabase fetch.
//
// Without this hook:
//   1. Server boots with configCache = {} (post data.ts deletion)
//   2. First cron tick: ensureConfigLoaded() runs Supabase fetch inline
//   3. ~50-300ms latency on the very first cron tick (cold start)
//
// With this hook:
//   1. Server boots
//   2. instrumentation runs → ensureConfigLoaded() → fetches + caches
//   3. configCache is already populated by the time any request arrives
//
// Fail-closed semantics preserved: if Supabase is down at boot, the
// hook logs an error but does NOT throw (so the server can still
// serve HTTP). Each request that needs config still calls
// ensureConfigLoaded() and respects fail-closed behavior.
//
// Reference:
//   https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
// ============================================

export async function register(): Promise<void> {
  // Edge runtime can't load the Supabase server client, so skip there.
  if (process.env.NEXT_RUNTIME === 'edgejs') return;

  // Defer-import to avoid loading Supabase modules at edge build time.
  const { ensureConfigLoaded } = await import('@/lib/game/config/server/configLoader.server');

  console.info('[instrumentation] Pre-warming game config from Supabase...');
  const result = await ensureConfigLoaded();
  if (result.ok) {
    console.info('[instrumentation] Game config pre-warmed successfully');
  } else {
    console.warn(
      '[instrumentation] Game config pre-warm FAILED — ' +
        (result.error ?? 'unknown reason') +
        '. Server will retry on first config-dependent request.',
    );
  }

  // Phase 2: pre-warm balance config and start the 60s polling timer.
  // Fail-closed: balance MUST be fully loaded from Supabase before any
  // gameplay-affecting route runs. Per RULES.md [SEC-002] / [ARC-009],
  // there is NO in-process default — the game refuses to start until
  // ops populates the DB. Best-effort retry via the 60s poller.
  try {
    const { refreshBalanceFromSupabase, startBalancePoller } = await import(
      '@/lib/game/config/server/configLoader.server',
    );
    const ok = await refreshBalanceFromSupabase();
    if (ok) {
      console.info('[instrumentation] Balance config pre-warmed successfully');
    } else {
      console.warn(
        '[instrumentation] Balance config pre-warm FAILED — ' +
          'getBalance() will throw BalanceNotLoadedError until DB is populated. ' +
          'Server will retry via 60s poller.',
      );
    }
    startBalancePoller();
    console.info(
      '[instrumentation] Balance poller started (60s interval)',
    );
  } catch (err) {
    console.warn(
      '[instrumentation] Balance setup FAILED:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

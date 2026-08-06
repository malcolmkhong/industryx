/**
 * Service-role Supabase client factory + module-scope singleton.
 *
 * Industry-standard pattern (per Supabase JS docs): construct the privileged
 * client ONCE at module scope and reuse it across requests. Service-role
 * clients hold no per-user auth state (autoRefreshToken + persistSession
 * are both off), so reuse is safe.
 *
 * Public API:
 *   - getDbClient():          SupabaseClient | null  (null = env not configured)
 *   - requireDbClient():      SupabaseClient        (throws DbClientNotConfiguredError)
 *   - isDbClientConfigured(): boolean
 *   - createServiceRoleClient(): legacy alias for getDbClient()
 *   - isServiceRoleConfigured():  legacy alias for isDbClientConfigured()
 *
 * The .server.ts suffix enforces Next.js server-only execution via the
 * bundler; importing this module from a client component is a build error.
 */

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { DbClientNotConfiguredError } from "./errors";

/**
 * Module-scope singleton cache. `undefined` = not yet built; otherwise the
 * last computed value (which may itself be `null` when env is missing).
 * The triple-state lets us distinguish "first call" from "cached null".
 */
let _cached: SupabaseClient | null | undefined;

function build(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Return the cached service-role Supabase client, or `null` if the required
 * environment variables are not set. Result is stable for the lifetime of
 * the Node process (one Vercel serverless instance).
 */
export function getDbClient(): SupabaseClient | null {
  if (_cached === undefined) {
    _cached = build();
  }
  return _cached;
}

/**
 * Return the cached service-role client or throw a typed, fail-closed error.
 * Use this in new code that wants a 503-style response on missing config
 * instead of `if (!supabase) return null` at every call site.
 */
export function requireDbClient(): SupabaseClient {
  const client = getDbClient();
  if (!client) {
    throw new DbClientNotConfiguredError();
  }
  return client;
}

/**
 * Cheap boolean check used by health endpoints and feature flags.
 */
export function isDbClientConfigured(): boolean {
  return getDbClient() !== null;
}

// ─── Legacy aliases (kept for the migration window) ──────────────────────
//
// New code MUST import from `@/lib/db/access` and prefer getDbClient() or
// requireDbClient(). The two names below preserve the existing public
// surface used by 66 source files and the test mock factory; deprecate
// after the migration completes (tracked in BUG-077).
//
// BUG-077 Task 1: legacy alias asserts reference identity with the
// canonical singleton so any future drift that introduces per-call
// client construction becomes a hard error instead of a silent
// GoTrueClient "multiple instances" regression.
//
// @deprecated Import from "@/lib/db/access" instead.
/**
 * @deprecated Use `getDbClient()` from `@/lib/db/access`.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  const client = getDbClient();
  if (client !== _cached) {
    throw new Error(
      "[BUG-077] createServiceRoleClient drifted from getDbClient singleton",
    );
  }
  return client;
}

/**
 * @deprecated Use `isDbClientConfigured()` from `@/lib/db/access`.
 */
export function isServiceRoleConfigured(): boolean {
  return isDbClientConfigured();
}

// ─── Cookie-aware anon client surface (re-exported for test mocking) ───
//
// The anon client lifecycle is per-request because it owns the request's
// cookie store; this factory must NOT be memoized. Tests can mock the
// entire server-side Supabase surface by mocking one boundary module.
//
// @deprecated Use `isSupabaseConfigured()` from `@/lib/supabase/server`
// directly for new code. Re-exported here only so a single
// vi.mock('@/lib/db/access', ...) covers both factories.

/**
 * @deprecated Use `createClient` from `@/lib/supabase/server` for new code.
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server client is not configured");
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have proxy refreshing sessions.
        }
      },
    },
  });
}

/**
 * @deprecated Use `isSupabaseConfigured()` from `@/lib/supabase/server`.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

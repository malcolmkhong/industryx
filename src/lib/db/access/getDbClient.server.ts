/**
 * Service-role Supabase client factory + module-scope singleton.
 *
 * Industry-standard pattern (per Supabase JS docs): construct the privileged
 * client ONCE at module scope and reuse it across requests. Service-role
 * clients hold no per-user auth state (autoRefreshToken + persistSession
 * are both off), so reuse is safe.
 *
 * Public API (canonical surface — BUG-077):
 *   - getDbClient():          SupabaseClient | null  (null = env not configured)
 *   - requireDbClient():      SupabaseClient        (throws DbClientNotConfiguredError)
 *   - isDbClientConfigured(): boolean
 *   - createClient():         Promise<SupabaseClient>  (per-request cookie-aware anon client)
 *   - isSupabaseConfigured(): boolean                  (env check for anon client)
 *
 * The .server.ts suffix enforces Next.js server-only execution via the
 * bundler; importing this module from a client component is a build error.
 *
 * Tests can mock the entire server-side Supabase surface through a single
 * import path:
 *
 *   vi.mock('@/lib/db/access', () => mockSupabaseServer());
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

// ─── Cookie-aware anon client surface ───────────────────────────────
//
// The anon client lifecycle is per-request because it owns the request's
// cookie store; this factory must NOT be memoized. Tests can mock the
// entire server-side Supabase surface by mocking one boundary module.

/**
 * Per-request Supabase server client with cookie-bound auth.
 *
 * This client MUST be created fresh for each request because it owns the
 * cookie store of the current request. See Supabase SSR docs: "A new
 * client must be created for each server render — never share a client
 * across requests."
 *
 * Do not use this factory for service-role access; use `getDbClient()`
 * or `requireDbClient()` instead.
 */
export async function createClient(): Promise<SupabaseClient> {
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
 * Check if Supabase anon client env vars are present. Used to gracefully
 * degrade when Supabase is unavailable.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getDbClient, isDbClientConfigured } from "@/lib/db/access";

/**
 * Check if Supabase is configured (env vars present).
 * Used to gracefully degrade when Supabase is unavailable.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Check if Supabase service role is configured.
 *
 * Re-exported from @/lib/db/access for backward compatibility with code
 * that already imports this name from @/lib/supabase/server. New code
 * should import `isDbClientConfigured` directly from `@/lib/db/access`.
 */
export function isServiceRoleConfigured(): boolean {
  return isDbClientConfigured();
}

/**
 * Per-request Supabase server client with cookie-bound auth.
 *
 * This client MUST be created fresh for each request because it owns the
 * cookie store of the current request. See Supabase SSR docs: "A new
 * client must be created for each server render — never share a client
 * across requests."
 *
 * Do not use this factory for service-role access; use
 * `@/lib/db/access` instead.
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
 * Service-role Supabase client.
 *
 * Re-exported from @/lib/db/access for backward compatibility with the 66
 * existing import sites. New code MUST use `@/lib/db/access` so the
 * boundary module owns the singleton lifecycle and the typed fail-closed
 * error path (requireDbClient / DbClientNotConfiguredError).
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY (or the project URL) is
 * missing; callers MUST check for null and return an appropriate error.
 */
export function createServiceRoleClient() {
  return getDbClient();
}

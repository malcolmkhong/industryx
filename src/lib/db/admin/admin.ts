/**
 * Supabase Admin Client Factory
 *
 * Industry-standard location for service-role Supabase client.
 * Bypasses RLS. Use ONLY in server-side code (API routes, server components).
 *
 * Per AGENTS.md: "Bypassing auth checks on API routes" is FORBIDDEN.
 * Use this client for legitimate server work, never to circumvent user auth.
 *
 * NOTE: This file is a re-export wrapper around the canonical boundary at
 * `@/lib/db/access`. It exists to:
 *   1. Provide an industry-standard import path (`@/lib/db/admin`)
 *   2. Allow future migration of Supabase client logic without breaking imports
 *   3. Centralize the "admin = service role" convention
 *
 * All existing `@/lib/supabase/server` and `@/lib/db/admin` imports continue
 * to work. New code SHOULD prefer `@/lib/db/access`, which owns the
 * singleton lifecycle and the typed DbClientNotConfiguredError path.
 */

export {
  createServiceRoleClient,
  isServiceRoleConfigured,
} from '@/lib/db/access';

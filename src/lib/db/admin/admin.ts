/**
 * Supabase Admin Client Factory
 *
 * Industry-standard location for service-role Supabase client.
 * Bypasses RLS. Use ONLY in server-side code (API routes, server components).
 *
 * Per AGENTS.md: "Bypassing auth checks on API routes" is FORBIDDEN.
 * Use this client for legitimate server work, never to circumvent user auth.
 *
 * NOTE: This file is a re-export wrapper around the existing
 * `@/lib/supabase/server` module. It exists to:
 *   1. Provide an industry-standard import path (`@/lib/db/admin`)
 *   2. Allow future migration of Supabase client logic without breaking imports
 *   3. Centralize the "admin = service role" convention
 *
 * All existing `@/lib/supabase/server` imports continue to work.
 * New code SHOULD prefer `@/lib/db/admin` for admin clients.
 */

export { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/server';

/**
 * Supabase User Client Factory
 *
 * Industry-standard location for user-scoped Supabase client.
 * Respects RLS. Use in server components, API routes (for user-context work).
 *
 * NOTE: This file is a re-export wrapper around the existing
 * `@/lib/supabase/server` module. It exists to:
 *   1. Provide an industry-standard import path (`@/lib/db/user`)
 *   2. Allow future migration of Supabase client logic without breaking imports
 *   3. Centralize the "user = RLS-respecting" convention
 *
 * All existing `@/lib/supabase/server` imports continue to work.
 * New code SHOULD prefer `@/lib/db/user` for user-context clients.
 */

export { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

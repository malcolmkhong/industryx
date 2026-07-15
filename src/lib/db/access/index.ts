/**
 * Canonical boundary for privileged Supabase access.
 *
 * All server-only code that needs the service-role Supabase client MUST
 * import from this module. The boundary enforces:
 *
 *   1. Module-scope singleton (no fresh client per call).
 *   2. Fail-closed behavior on missing env (typed DbClientNotConfiguredError).
 *   3. A single import path that the architecture test can enforce.
 *
 * The boundary also re-exports the cookie-aware anon client factory
 * (createClient) and the env-check helpers so tests can mock the entire
 * server-side Supabase surface through one path:
 *
 *   vi.mock('@/lib/db/access', () => mockSupabaseServer());
 *
 * The anon client's lifecycle stays per-request inside the boundary; only
 * the import path is unified.
 */

// Public API (preferred names)
export {
  getDbClient,
  requireDbClient,
  isDbClientConfigured,
  // Legacy aliases re-exported here so existing consumers keep working
  // during the migration. New code should prefer getDbClient().
  createServiceRoleClient,
  isServiceRoleConfigured,
  // Cookie-aware anon client factory (per-request). Re-exported from
  // @/lib/supabase/server so tests can mock both clients through a
  // single boundary path.
  createClient,
  isSupabaseConfigured,
} from './getDbClient.server';

export { DbClientNotConfiguredError } from './errors';
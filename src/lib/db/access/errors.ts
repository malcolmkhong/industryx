/**
 * Error types for the @/lib/db/access boundary.
 */

/**
 * Thrown by requireDbClient() when SUPABASE_SERVICE_ROLE_KEY (or the project
 * URL) is missing at module-evaluation or first-call time. Surfaces a typed,
 * fail-closed signal so routes and server helpers can map the failure to a
 * 503 DB_CLIENT_NOT_CONFIGURED response instead of a generic crash.
 *
 * Per .rules [SEC-002] and [ARC-009], the privileged DB client must fail
 * closed; this class is the boundary's typed equivalent of returning null.
 */
export class DbClientNotConfiguredError extends Error {
  public readonly code = 'DB_CLIENT_NOT_CONFIGURED';

  constructor(
    message = 'Supabase service-role client is not configured (SUPABASE_SERVICE_ROLE_KEY missing).',
  ) {
    super(message);
    this.name = 'DbClientNotConfiguredError';
  }
}
// ============================================
// Next.js Instrumentation Hook
// Runs ONCE per server instance at startup.
// ============================================

/**
 * Node-only entrypoint for server config boot.
 * The config server domain owns loading and refresh policy.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Defer-import to keep Node-only config modules out of the Edge bundle.
  const { bootstrapConfigRuntime } = await import(
    '@/lib/game/config/server/bootstrap.server',
  );
  await bootstrapConfigRuntime();
}

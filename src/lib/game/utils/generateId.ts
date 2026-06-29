/**
 * generateId.ts — Utility function for generating unique IDs.
 *
 * Extracted from store.ts to break the monolithic file into feature-based
 * modules per the STORE_DECOMPOSITION_ARCHITECTURE.md plan.
 *
 * Uses crypto.randomUUID() for cryptographically secure, collision-resistant IDs.
 * This replaces any prior use of Math.random() for security-sensitive IDs (BUG-012).
 */
export function generateId(): string {
  return crypto.randomUUID();
}

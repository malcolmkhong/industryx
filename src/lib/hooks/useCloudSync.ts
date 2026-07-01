/**
 * Re-export barrel for the decomposed cloudSync/ module.
 *
 * All consumers import from `@/lib/hooks/useCloudSync` — this barrel
 * preserves that contract. The actual implementation lives in
 * `src/lib/hooks/cloudSync/`.
 */
export { useCloudSync } from './cloudSync/index';
export type { CloudSyncState, CloudBlockState } from './cloudSync/types';

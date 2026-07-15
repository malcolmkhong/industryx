// ============================================
// INDUSTRIAX: Production Chain Derivation
// ============================================
//
// Batch 5 organizational re-export. The implementation
// (`deriveProductionChains`, `findDownstreamProducer`,
// `prettifyChainName`, `hashColor`) lives in `../runtimeCache` to keep
// the `RESOURCE_META` `globalThis` lookup co-located with the live
// cache it reads from.
//
// This file exists so `configCache.ts` (the public barrel) can group
// "the derived chains" of the config cache separately from the cache
// itself, matching the layout in SPAGHETTI_CODE_REFACTOR_PLAN.md.
// ============================================

export {
  deriveProductionChains,
  findDownstreamProducer,
  prettifyChainName,
  hashColor,
} from "../runtimeCache";

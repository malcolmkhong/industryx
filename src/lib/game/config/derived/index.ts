// ============================================
// INDUSTRIAX: Derived Config — Barrel
// ============================================
//
// Re-exports all derived/config-derived helpers from a single
// import path. Consumers that only need derived data can write:
//
//   import { deriveProductionChains, getResourceName } from
//     "@/lib/game/config/derived";
//
// without reaching into individual files.
// ============================================

export {
  deriveProductionChains,
  prettifyChainName,
  hashColor,
} from "./productionChains";

export {
  deriveContractTemplates,
  type DerivedContractTemplate,
} from "./contractTemplates";

export {
  getResourceMeta,
  getResourceName,
  getResourceIcon,
  getResourceColor,
  getResourceBaseCapacity,
  formatResourceAmount,
  formatStorageCapacity,
  prettifyResourceName,
  type ResourceDisplayMeta,
} from "./resourceDisplay";

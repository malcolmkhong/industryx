// ============================================
// INDUSTRIAX: Contract Template Derivation
// ============================================
//
// Batch 5 organizational re-export. The implementation
// (`deriveContractTemplates`) lives in `../runtimeCache` to keep it
// co-located with the building graph it reads from.
//
// This file exists so `configCache.ts` (the public barrel) can group
// "the derived contracts" of the config cache separately from the
// cache itself, matching the layout in
// SPAGHETTI_CODE_REFACTOR_PLAN.md.
// ============================================

export { deriveContractTemplates } from "../runtimeCache";

// Re-export the inline interface for callers that imported it from
// this file. The original `runtimeCache` declaration is the source of
// truth; the structure is preserved here for the batch-5 boundary.
export type DerivedContractTemplate = {
  name: string;
  description: string;
  type: string;
  requiredResources: Array<{ resource: string; amount: number }>;
  timeLimit: number;
  difficulty: number;
  gameTier: number;
  icon: string;
};

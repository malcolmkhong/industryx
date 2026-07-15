// ============================================
// INDUSTRIAX: Config Cache Update
// ============================================
//
// Batch 5 organizational re-export. The authoritative
// `updateFromSupabase` lives in `./runtimeCache` (where the let-bound
// cache refs are declared) so the reassignment happens in the same
// module — TypeScript blocks cross-module `let` rebinding.
//
// This file exists so `configCache.ts` (the public barrel) can group
// "the update side" of the config cache separately from "the cache
// itself", matching the layout in SPAGHETTI_CODE_REFACTOR_PLAN.md.
// ============================================

export { updateFromSupabase } from "./runtimeCache";

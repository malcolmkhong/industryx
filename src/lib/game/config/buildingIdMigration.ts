// ============================================
// INDUSTRIAX: Building ID Migration
// ============================================
//
// Batch 5 organizational re-export. The migration map and helpers
// (`BUILDING_ID_MIGRATION`, `migrateBuildingDefs`, `migrateBuildingId`,
// `mergedBuildingDefs`) live in `./runtimeCache` so the `let`-rebinding
// inside `migrateBuildingDefs` stays in-module — TypeScript blocks
// cross-module `let` rebinding.
//
// This file exists so `configCache.ts` (the public barrel) can group
// "the migration side" of the config cache separately from the cache
// itself, matching the layout in SPAGHETTI_CODE_REFACTOR_PLAN.md.
//
// The canonical per-id helper still lives in `../migration/idMigration`
// and operates on a parallel `BUILDING_ID_MAP` for save-state migration.
// ============================================

export {
  BUILDING_ID_MIGRATION,
  migrateBuildingDefs,
} from "./runtimeCache";

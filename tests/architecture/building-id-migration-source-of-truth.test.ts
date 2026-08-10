/**
 * tests/architecture/building-id-migration-source-of-truth.test.ts
 *
 * Architectural guardrail: there must be exactly ONE canonical
 * source of truth for the building-ID migration map. The
 * canonical owner is `src/lib/game/migration/idMigration.ts`
 * (which exposes `BUILDING_ID_MAP` + `migrateBuildingId`).
 *
 * Previously, `src/lib/game/config/runtimeCache.ts` held a
 * parallel `BUILDING_ID_MIGRATION` map and a private
 * `migrateBuildingId` function. Both had the same 3 entries by
 * accident — if one map got a new entry without the other, the
 * runtime migration (BUILDING_DEFS lookup) would silently
 * disagree with the save-state migration
 * (`migrateSaveBuildings`), causing data loss on load.
 *
 * The fix made `runtimeCache.ts` re-export the canonical map
 * under the legacy alias, so external callers keep working.
 * This test enforces that contract.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = process.cwd();

const runtimeCachePath = "src/lib/game/config/runtimeCache.ts";
const idMigrationPath = "src/lib/game/migration/idMigration.ts";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("building-id migration has a single source of truth", () => {
  it("runtimeCache.ts no longer defines BUILDING_ID_MIGRATION inline", () => {
    const source = read(runtimeCachePath);
    // The inline map used to be:
    //   export const BUILDING_ID_MIGRATION: Record<string, string> = { ... };
    // It's now a re-export alias. The defining site is
    // idMigration.ts. If a regression reintroduces an inline
    // map, this test fails.
    expect(source).not.toMatch(
      /export\s+const\s+BUILDING_ID_MIGRATION\s*:\s*Record<string,\s*string>\s*=\s*\{/,
    );
  });

  it("runtimeCache.ts re-exports BUILDING_ID_MAP as BUILDING_ID_MIGRATION", () => {
    const source = read(runtimeCachePath);
    // The re-export preserves the legacy alias so consumers
    // that import `{ BUILDING_ID_MIGRATION } from
    // "./runtimeCache"` (e.g. `buildingIdMigration.ts`)
    // continue to resolve.
    expect(source).toMatch(
      /export\s*\{\s*BUILDING_ID_MAP\s+as\s+BUILDING_ID_MIGRATION\s*\}\s*from\s*["']\.\.\/migration\/idMigration["']/,
    );
  });

  it("runtimeCache.ts no longer defines migrateBuildingId locally", () => {
    const source = read(runtimeCachePath);
    // Look for a function-body definition (not the re-export).
    // The previous private function was:
    //   function migrateBuildingId(id: string): string { ... }
    expect(source).not.toMatch(
      /^function\s+migrateBuildingId\s*\(/m,
    );
  });

  it("runtimeCache.ts imports migrateBuildingId from idMigration.ts", () => {
    const source = read(runtimeCachePath);
    // The internal call inside migrateBuildingDefs() needs a
    // local binding. Re-exports alone do NOT make a symbol
    // visible as a local — there must be a separate `import`
    // statement (this was the original regression caught by
    // tsc after the first attempt at the fix).
    expect(source).toMatch(
      /import\s*\{\s*migrateBuildingId\s*\}\s*from\s*["']\.\.\/migration\/idMigration["']/,
    );
  });

  it("idMigration.ts owns the canonical map (BUILDING_ID_MAP)", () => {
    const source = read(idMigrationPath);
    expect(source).toMatch(/export\s+const\s+BUILDING_ID_MAP/);
    expect(source).toMatch(/export\s+function\s+migrateBuildingId/);
  });
});
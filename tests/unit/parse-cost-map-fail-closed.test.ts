/**
 * tests/unit/parse-cost-map-fail-closed.test.ts
 *
 * C-005 (BUILDING_PRODUCTION_AUDIT §10.6 P1, 2026-07-16):
 *   Four production copies of `parseCostMap` silently fabricated a
 *   `[{resource: "money", amount: 100}]` default when `base_cost` was
 *   null. The offline-progress route already failed closed (it throws).
 *   After this pass every production copy throws on null/missing cost.
 *
 *   A missing `base_cost` is a DB-integrity issue; silently defaulting
 *   to 100 money could let a player build a building at a non-existent
 *   price or mask a migration backfill bug.
 *
 *   This test pins the canonical client-side transformer's behavior.
 *   Server-side copies (`serverConfigFetcher.ts`,
 *   `configParsers.ts`, `admin/investigations/configLoader.ts`) share
 *   the same behavior by matching the regex in the regression check
 *   below.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCostMap } from "@/lib/game/config/transformers/buildings";

const SRC = join(process.cwd(), "src");

// Server-side copies that were updated in C-005. Any new copy must be
// added here and must throw on null.
const SERVER_COPIES = [
  "lib/db/config/serverConfigFetcher.ts",
  "lib/game/actions/server/shared/configParsers.ts",
  "lib/admin/investigations/configLoader.ts",
  "app/api/game/state/offline-progress/route.ts",
] as const;

const FAIL_OPEN_RE = /if\s*\(!costMap\)\s*return\s*\[\{\s*resource:\s*["']money["'],\s*amount:\s*100\s*\}\]/;

describe("C-005 — parseCostMap fails closed on null/missing cost", () => {
  it("canonical: throws on null", () => {
    expect(() => parseCostMap(null)).toThrow(/null\/missing base_cost/);
  });

  it("canonical: throws on undefined", () => {
    expect(() =>
      parseCostMap(undefined as unknown as null),
    ).toThrow(/null\/missing base_cost/);
  });

  it("canonical: passes through array format", () => {
    const result = parseCostMap([
      { resource: "iron", amount: 10 },
      { resource: "money", amount: 50 },
    ]);
    expect(result).toEqual([
      { resource: "iron", amount: 10 },
      { resource: "money", amount: 50 },
    ]);
  });

  it("canonical: passes through object format", () => {
    const result = parseCostMap({ iron: 10, money: 50 });
    expect(result).toEqual([
      { resource: "iron", amount: 10 },
      { resource: "money", amount: 50 },
    ]);
  });

  it.each(SERVER_COPIES)(
    "%s no longer has the silent 100-money default",
    (relPath) => {
      const content = readFileSync(join(SRC, relPath), "utf8");
      expect(content).not.toMatch(FAIL_OPEN_RE);
    },
  );
});

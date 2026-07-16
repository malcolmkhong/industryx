/**
 * tests/unit/p2-10-thin-delegators-removed.test.ts
 *
 * P2-10 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
 *   The 5 thin server math wrappers
 *     - production.server.ts
 *     - power.server.ts
 *     - payout.server.ts
 *     - endgame.server.ts
 *     - sell.server.ts
 *   and the `engine/math/index.server.ts` barrel added zero behavior
 *   beyond packaging `buildings` + `workerDefs` into the `gameDefs`
 *   shape. After caller migration (runServerTicks and the snapshot
 *   builder now import directly from `productionCalculator`), the
 *   wrappers and barrel were removed. `multipliers.server.ts` is kept
 *   because it does real server-specific work (cache builder,
 *   worker-defs map, getBuildingDef).
 *
 *   This test pins the removal: a re-introduced wrapper would let the
 *   old `*Server` paths drift from the direct imports.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function readSource(relPath: string): string {
  return readFileSync(join(SRC, relPath), "utf8");
}

describe("P2-10 — thin server math delegators removed", () => {
  const removedWrappers = [
    "lib/game/production/engine/math/production.server.ts",
    "lib/game/production/engine/math/power.server.ts",
    "lib/game/production/engine/math/payout.server.ts",
    "lib/game/production/engine/math/endgame.server.ts",
    "lib/game/production/engine/math/sell.server.ts",
    "lib/game/production/engine/math/index.server.ts",
  ] as const;

  it.each(removedWrappers)("%s does not exist", (relPath) => {
    expect(existsSync(join(SRC, relPath))).toBe(false);
  });

  it("runServerTicks imports math directly from productionCalculator", () => {
    const content = readSource(
      "lib/game/production/engine/tick/runServerTicks.ts",
    );
    expect(content).toMatch(
      /import\s*\{[^}]*computeProduction[^}]*\}\s*from\s*["']\.\.\/\.\.\/productionCalculator["']/,
    );
    expect(content).toMatch(/computePowerGrid/);
    expect(content).toMatch(/computeEndgameIncome/);
    expect(content).not.toMatch(/production\.server/);
    expect(content).not.toMatch(/power\.server/);
    expect(content).not.toMatch(/endgame\.server/);
  });

  it("productionSnapshot imports math directly from productionCalculator", () => {
    const content = readSource(
      "lib/game/production/engine/tick/productionSnapshot.ts",
    );
    // Path from src/lib/game/production/engine/tick/ up two levels lands on
    // src/lib/game/production/productionCalculator.
    expect(content).toMatch(
      /from\s*["']\.\.\/\.\.\/productionCalculator["']/,
    );
    // The only `.server` import that may remain is `multipliers.server`
    // (server-specific cache builder, kept by design). No
    // production/power/payout/endgame/sell.server may remain.
    const codeOnly = content
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    for (const removed of [
      "production.server",
      "power.server",
      "payout.server",
      "endgame.server",
      "sell.server",
    ]) {
      expect(
        codeOnly,
        `productionSnapshot still references ${removed}`,
      ).not.toContain(removed);
    }
  });

  it("multipliers.server.ts (the real server-specific owner) remains", () => {
    expect(
      existsSync(
        join(SRC, "lib/game/production/engine/math/multipliers.server.ts"),
      ),
    ).toBe(true);
  });
});

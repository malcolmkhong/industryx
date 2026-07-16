/**
 * tests/unit/p2-12-leaderboard-polling.test.ts
 *
 * P2-12 (BUILDING_PRODUCTION_AUDIT §10.6 P2, 2026-07-16):
 *   LeaderboardPanel used `setInterval(fetchLeaderboard, 30_000)` with
 *   no visibility handling and no failure backoff. Replaced with the
 *   shared `useLeaderboardPolling` hook.
 *
 * This test pins:
 *   1. The component no longer owns a raw setInterval for polling.
 *   2. The component imports and calls the shared hook.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function readSource(relPath: string): string {
  return readFileSync(join(SRC, relPath), "utf8");
}

describe("P2-12 — LeaderboardPanel uses shared polling hook", () => {
  const path = "components/game/LeaderboardPanel.tsx";
  const content = readSource(path);

  it("imports the shared useLeaderboardPolling hook", () => {
    expect(content).toMatch(/useLeaderboardPolling/);
  });

  it("does not own a setInterval for polling", () => {
    // Strip line comments since the file may reference setInterval in
    // other contexts (animations, etc.).
    const codeOnly = content
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    expect(
      codeOnly,
      "LeaderboardPanel still owns a setInterval — P2-12 incomplete",
    ).not.toMatch(/setInterval\s*\(\s*fetchLeaderboard/);
    expect(codeOnly).not.toMatch(/clearInterval\s*\(\s*interval\s*\)/);
  });
});

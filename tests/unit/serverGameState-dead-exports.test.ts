/**
 * tests/unit/serverGameState-dead-exports.test.ts
 *
 * PR-BP-4a regression guard (2026-07-15):
 *   `loadLockState` and `hasServerGameState` were removed because they
 *   had no callers. Lock enforcement is now done inline at the gate
 *   points (link-route uses `loadServerGameStateForPreview` + manual
 *   `is_locked` check; trade-history uses `getUserGuestStatus`).
 *   Duplicate-row guard is the `server_game_state.user_id` PRIMARY KEY.
 *
 *   This test pins the current state: the two symbols MUST NOT be
 *   re-exported. If a future PR re-adds them, this test fails.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(
  process.cwd(),
  "src",
  "lib",
  "db",
  "game",
  "serverGameState.ts",
);

describe("PR-BP-4a — dead exports removed from serverGameState", () => {
  const src = readFileSync(SRC, "utf8");

  it("does not export loadLockState", () => {
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+loadLockState\b/);
  });

  it("does not export hasServerGameState", () => {
    expect(src).not.toMatch(
      /export\s+(async\s+)?function\s+hasServerGameState\b/,
    );
  });

  it("does not re-export the symbols from the barrel either", () => {
    // Belt + suspenders: any future re-export would also leak the symbol
    // back into the public surface.
    expect(src).not.toMatch(/\bloadLockState\b/);
    expect(src).not.toMatch(/\bhasServerGameState\b/);
  });
});
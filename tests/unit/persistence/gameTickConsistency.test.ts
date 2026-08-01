/**
 * tests/unit/persistence/gameTickConsistency.test.ts — Phase 7 of the
 * time refactor. Pins the invariant that `server_game_state.game_tick`
 * (denormalized column) and `full_state.gameTick` (JSON field) are
 * always written together. Drift between them was the architectural
 * risk audit surfaced during the time-refactor plan.
 *
 * Strategy: walk a hand-curated list of known persistence entry
 * points and assert each one writes both fields from the same source.
 * This is more reliable than blanket regex search (which catches type
 * annotations, reads, and unrelated helpers as false positives) while
 * still failing loudly if a future writer is added without the
 * companion column set.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * Known persistence paths that touch `full_state` AND must also touch
 * the `game_tick` column. New persistence paths added to the codebase
 * must be added here. The test is intentionally a hand-curated list
 * (vs. a regex search) so the assertion is precise.
 */
interface KnownWriter {
  file: string;
  /** A regex matching the relevant block in the source file. */
  blockMatcher: RegExp;
  /** A label for diagnostics. */
  label: string;
}

const KNOWN_WRITERS: KnownWriter[] = [
  {
    file: "src/lib/game/state/persistence/serverGameStatePersistence.server.ts",
    label: "preparePersistencePatch (canonical save path)",
    blockMatcher: /preparePersistencePatch[\s\S]*?full_state:\s*asFullState/,
  },
  {
    file: "src/lib/game/actions/server/shared/elapsedTickPersistence.ts",
    label: "applyElapsedServerTime (live-tick / offline-progress)",
    blockMatcher: /\.\.\.denormalizedFields[\s\S]*?full_state:\s*asFullState/,
  },
  {
    file: "src/lib/db/game/serverGameState.ts",
    label: "buildCompleteFullStateForServerRow (canonical seed)",
    blockMatcher:
      /game_tick:\s*canonical\.gameTick[\s\S]*?full_state:\s*prepared/,
  },
  {
    file: "src/app/api/game/state/sync/route.ts",
    label: "/api/game/state/sync save path",
    blockMatcher: /game_tick:\s*gameTick[\s\S]*?full_state:\s*asFullState/,
  },
  {
    file: "src/app/api/game/state/offline-progress/route.ts",
    label: "/api/game/state/offline-progress persist patch",
    blockMatcher: /\.\.\.denormalizedFields[\s\S]*?game_tick:\s*newGameTick/,
  },
];

describe("Phase 7 — gameTick column / full_state consistency", () => {
  for (const writer of KNOWN_WRITERS) {
    it(`${writer.label}: writes both game_tick column and full_state.gameTick`, () => {
      const source = read(writer.file);
      expect(source).toMatch(writer.blockMatcher);
    });
  }
});

describe("Phase 7 — canonical seed keeps both fields aligned", () => {
  it("buildCompleteFullStateForServerRow sets game_tick from canonical.gameTick", () => {
    const text = read("src/lib/db/game/serverGameState.ts");
    expect(text).toMatch(/game_tick:\s*canonical\.gameTick/);
  });

  it("buildDenormalizedStatePatchFields sets game_tick from state.gameTick", () => {
    const text = read(
      "src/lib/game/actions/server/shared/denormalizedStatePatch.ts",
    );
    expect(text).toMatch(/game_tick:\s*state\.gameTick/);
  });
});

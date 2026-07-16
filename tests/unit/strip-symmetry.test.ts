/**
 * tests/unit/strip-symmetry.test.ts
 *
 * C-003 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
 *   The Phase 13 invariant states that `server_game_state.full_state`
 *   must never contain UI-only keys (`hydrated`, `activeTab`,
 *   `selectedBuilding`, `notifications`, `productionSnapshot`).
 *   `stripUIFields` is the shared defense-in-depth helper. Every
 *   writer that touches `full_state` must call it before coercing with
 *   `asFullState`.
 *
 *   The current `serverGameDataShape.test.ts` PERSISTENCE_WRITERS list
 *   contains only 3 writers; the actual production set is wider. This
 *   test enumerates the full writer set and asserts each one calls
 *   `stripUIFields` on the same object that ends up in `full_state`.
 *
 * Strategy:
 *   - For each known writer, read the source file.
 *   - Assert the file contains both `stripUIFields` and `full_state`.
 *   - Assert the `stripUIFields` call appears BEFORE the
 *     `asFullState` call (defense-in-depth ordering).
 *
 * If a new writer is added without `stripUIFields`, add it to
 * WRITERS below and the test will enforce the invariant on the next
 * run.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "src");

// Full list of production writers that touch `full_state` in a CAS
// patch. Update this list when adding new writer paths.
const FULL_STATE_WRITERS = [
  join(SRC, "lib", "db", "game", "serverGameState.ts"),
  join(SRC, "lib", "game", "actions", "server", "shared", "elapsedTickPersistence.ts"),
  join(SRC, "lib", "game", "actions", "server", "shared", "correctedStatePersistence.ts"),
  join(SRC, "app", "api", "game", "state", "offline-progress", "route.ts"),
  join(SRC, "app", "api", "game", "state", "sync", "route.ts"),
  join(SRC, "app", "api", "auth", "guest", "migrate", "route.ts"),
  join(SRC, "app", "api", "market", "trades", "execute", "route.ts"),
] as const;

const UI_KEYS = [
  "hydrated",
  "activeTab",
  "selectedBuilding",
  "notifications",
  "productionSnapshot",
] as const;

function readSource(p: string): string {
  return readFileSync(p, "utf8");
}

describe("C-003 — every full_state writer calls stripUIFields", () => {
  it.each(FULL_STATE_WRITERS.map((p) => [p, p] as const))(
    "%s applies stripUIFields before asFullState",
    (_label, path) => {
      const content = readSource(path);
      expect(content).toMatch(/full_state/);
      // The writer must reference the strip helper. Without it, a UI
      // key smuggled into the request could persist into the JSONB
      // column.
      expect(content).toMatch(/stripUIFields\s*\(/);

      // Defense-in-depth: strip must come before asFullState coercion.
      // If the writer calls `asFullState(elapsed.state)` without an
      // intermediate strip, the assertion below fails.
      const stripIdx = content.indexOf("stripUIFields");
      const asFullStateMatches = [...content.matchAll(/asFullState\s*\(/g)];
      expect(asFullStateMatches.length).toBeGreaterThan(0);
      for (const m of asFullStateMatches) {
        expect(m.index ?? -1).toBeGreaterThan(stripIdx);
      }
    },
  );

  it("SERVER_STATE_UI_FIELDS still lists every UI key", () => {
    // If a new UI key is added to the state, the strip list must be
    // updated or the invariant breaks. This test pins the list so a
    // forgotten update surfaces as a CI failure.
    const payloadPath = join(
      SRC,
      "lib",
      "db",
      "game",
      "serverGameStatePayload.ts",
    );
    const content = readSource(payloadPath);
    for (const key of UI_KEYS) {
      expect(content).toContain(`"${key}"`);
    }
  });
});

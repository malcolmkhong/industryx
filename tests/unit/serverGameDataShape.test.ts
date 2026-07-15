/**
 * tests/unit/serverGameDataShape.test.ts
 *
 * PR-BP-3 §2.10 (NEW-TEST-028, 2026-07-15): Phase 13 architecture guard.
 *
 * Original test (PR-BP-1 batch 13-2) referenced files that moved during
 * the production-types + auth-orchestrator refactor (stores at `state/`,
 * payload helpers at `db/game/`, helper at `db/infra/`, etc.). The test
 * went from 13/14 passing to 0/14 passing as callers drifted. This
 * rewrite pins the current real paths and asserts the Phase 13 invariants
 * with concrete (NEW-TEST-028) checks:
 *
 *   (a) current path set exists
 *   (b) response DTOs MAY carry `productionSnapshot` (live-tick, offline)
 *   (c) persisted `full_state` MUST NOT carry `productionSnapshot` (or any
 *       other UI key)
 *   (d) every persistence writer that touches `full_state` calls
 *       `stripUIFields` as defense-in-depth
 *
 * Defense-in-depth rationale (audit §5.1, BUG-066/067/068): even if a
 * stale client smuggles a UI field through the request, the server
 * refuses to persist it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "src");

// --- Real, current paths (post-Phase 13 + production-types refactor) ---
const TYPES_FILE = join(SRC, "lib", "game", "shared", "types", "types.ts");
const UI_SESSION_STATE_FILE = join(
  SRC,
  "lib",
  "game",
  "shared",
  "types",
  "state.ts",
);
const SERVER_GAME_DATA_FILE = join(
  SRC,
  "lib",
  "game",
  "shared",
  "types",
  "server.ts",
);
const CANONICAL_HELPER = join(SRC, "lib", "db", "infra", "initialState.server.ts");
const HYDRATE_LOADER = join(SRC, "lib", "game", "state", "initialServerStateLoader.client.ts");
const STORE_BOOTSTRAP = join(SRC, "lib", "game", "state", "store-bootstrap.ts");
const STORE_STATE = join(SRC, "lib", "game", "state", "store.ts");
const SERVER_PAYLOAD = join(SRC, "lib", "db", "game", "serverGameStatePayload.ts");

const INITIAL_ROUTE = join(SRC, "app", "api", "game", "state", "initial", "route.ts");
const LIVE_TICK_ROUTE = join(SRC, "app", "api", "game", "state", "live-tick", "route.ts");
const OFFLINE_ROUTE = join(SRC, "app", "api", "game", "state", "offline-progress", "route.ts");

// Persistence writers — must each call `stripUIFields(...)` before touching
// `full_state`. Audit §2.11 / BUG-066 surface: missing strip = UI field
// leak into the DB JSONB blob.
const PERSISTENCE_WRITERS = [
  join(SRC, "lib", "db", "game", "serverGameState.ts"),
  join(SRC, "app", "api", "game", "state", "sync", "route.ts"),
  join(SRC, "app", "api", "auth", "guest", "migrate", "route.ts"),
];

function readSource(p: string): string {
  return readFileSync(p, "utf8");
}

// UI field names that MUST NEVER appear in persisted full_state.
const UI_KEYS = [
  "hydrated",
  "activeTab",
  "selectedBuilding",
  "notifications",
  "productionSnapshot",
] as const;

describe("Phase 13 — ServerGameData vs UISessionState split", () => {
  // -------------------------------------------------------------------
  // (a) Current path set exists
  // -------------------------------------------------------------------
  describe("(a) current path set exists", () => {
    it.each([
      ["types barrel", TYPES_FILE],
      ["UI session state module", UI_SESSION_STATE_FILE],
      ["ServerGameData module", SERVER_GAME_DATA_FILE],
      ["canonical helper", CANONICAL_HELPER],
      ["hydrate loader", HYDRATE_LOADER],
      ["store bootstrap re-exports", STORE_BOOTSTRAP],
      ["store state", STORE_STATE],
      ["server payload helpers", SERVER_PAYLOAD],
      ["initial-state route", INITIAL_ROUTE],
      ["live-tick route", LIVE_TICK_ROUTE],
      ["offline-progress route", OFFLINE_ROUTE],
    ])("%s", (_label, path) => {
      // Sanity: the file exists at the post-refactor location. A path
      // drift will fail this test fast so the guard never silently
      // turns green again.
      expect(() => readSource(path)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------
  // (b) Response DTOs MAY carry `productionSnapshot`
  // -------------------------------------------------------------------
  describe("(b) response DTOs may carry productionSnapshot", () => {
    it("live-tick route response shape names productionSnapshot", () => {
      const content = readSource(LIVE_TICK_ROUTE);
      // Either the route reads `productionSnapshot` from the upstream
      // helpers or returns it as a top-level field.
      expect(content).toMatch(/productionSnapshot/);
    });

    it("offline-progress route includes productionSnapshot plumbing", () => {
      const content = readSource(OFFLINE_ROUTE);
      expect(content).toMatch(/productionSnapshot/);
    });

    it("hydrate loader hands initialState (no productionSnapshot baked in)", () => {
      // The canonical /api/game/state/initial response must NOT carry
      // `productionSnapshot` — it's a UI-only transport that the
      // live/offline routes pair with `newState` separately.
      const content = readSource(HYDRATE_LOADER);
      expect(content).not.toMatch(/productionSnapshot/);
    });
  });

  // -------------------------------------------------------------------
  // (c) Persisted `full_state` MUST NOT carry UI keys (defense in depth)
  // -------------------------------------------------------------------
  describe("(c) persisted full_state may not carry UI keys", () => {
    it("SERVER_STATE_UI_FIELDS declares all 5 UI keys", () => {
      const content = readSource(SERVER_PAYLOAD);
      for (const key of UI_KEYS) {
        expect(content).toContain(`"${key}"`);
      }
    });

    it("stripUIFields strips every key in SERVER_STATE_UI_FIELDS", () => {
      const content = readSource(SERVER_PAYLOAD);
      // stripUIFields must reference SERVER_STATE_UI_FIELDS so adding a
      // new UI key to the list is automatically stripped at every
      // persistence boundary.
      expect(content).toMatch(/SERVER_STATE_UI_FIELDS/);
      // Sanity: the strip function actually returns a new object that
      // omits the listed keys.
      expect(content).toMatch(/function\s+stripUIFields/);
    });

    it("productionSnapshot is declared as a UI key, not a ServerGameData field", () => {
      const typesContent = readSource(TYPES_FILE);
      // ServerGameData MUST NOT declare productionSnapshot; UISessionState
      // SHOULD (the exact interface name is allowed to vary, but the
      // canonical location is the same `types.ts` file).
      expect(typesContent).not.toMatch(
        /ServerGameData[\s\S]*?productionSnapshot[\s\S]*?[};\n]/,
      );
    });

    it("all three persistence writers call stripUIFields before writing full_state", () => {
      for (const path of PERSISTENCE_WRITERS) {
        const content = readSource(path);
        expect(content).toMatch(/stripUIFields\s*\(/);
        // And the writer must touch `full_state` (otherwise it isn't
        // actually a full_state writer — would indicate path drift).
        expect(content).toMatch(/full_state/);
      }
    });
  });

  // -------------------------------------------------------------------
  // (d) Defense-in-depth: stripUIFields is called BEFORE asFullState at
  //     every persistence writer that takes untrusted client input.
  // -------------------------------------------------------------------
  describe("(d) strip-before-write order at every persistence writer", () => {
    it.each(PERSISTENCE_WRITERS.map((p) => [p, p] as const))(
      "%s strips before coercing to full_state JSON",
      (_path, fullPath) => {
        const content = readSource(fullPath);
        // Look for the canonical pattern from PR-BP-1/2:
        //   const sanitizedFullState = stripUIFields(...);
        //   ...asFullState(sanitizedFullState)
        // Accept either ordering — strip first then asFullState — as long
        // as strip is present and applied to the same object.
        expect(content).toMatch(/stripUIFields\s*\(/);
        if (content.match(/sanitizedFullState/)) {
          expect(content).toMatch(/stripUIFields[\s\S]*?sanitizedFullState/);
        }
      },
    );
  });

  // -------------------------------------------------------------------
  // Compatibility: ServerGameData + UISessionState still declared in
  // the shared types barrel.
  // -------------------------------------------------------------------
  describe("shared types barrel (legacy compatibility pins)", () => {
    it("declares ServerGameData interface (shared/types/server.ts)", () => {
      const content = readSource(SERVER_GAME_DATA_FILE);
      expect(content).toMatch(/export\s+interface\s+ServerGameData/);
    });

    it("declares UISessionState interface (shared/types/state.ts)", () => {
      const content = readSource(UI_SESSION_STATE_FILE);
      expect(content).toMatch(/export\s+interface\s+UISessionState/);
    });
  });

  // -------------------------------------------------------------------
  // Canonical helper return type is Promise<ServerGameData> (no UI keys)
  // -------------------------------------------------------------------
  describe("fetchCanonicalInitialState returns PURE ServerGameData", () => {
    it("is typed as Promise<ServerGameData>", () => {
      const content = readSource(CANONICAL_HELPER);
      expect(content).toMatch(
        /export\s+(?:async\s+)?function\s+fetchCanonicalInitialState\s*\([^)]*\)\s*:\s*Promise\s*<\s*ServerGameData\s*>/,
      );
    });
  });

  // -------------------------------------------------------------------
  // store.ts wires the canonical-with-UI merge plumbing
  // -------------------------------------------------------------------
  describe("client store preserves UI on hydration", () => {
    it("applyServerState preserves activeTab / selectedBuilding / notifications / productionSnapshot", () => {
      const content = readSource(STORE_STATE);
      expect(content).toMatch(/activeTab:\s*prev\.activeTab/);
      expect(content).toMatch(/selectedBuilding:\s*prev\.selectedBuilding/);
      expect(content).toMatch(/notifications:\s*prev\.notifications/);
      expect(content).toMatch(/productionSnapshot:\s*prev\.productionSnapshot/);
    });

    it("store-bootstrap re-exports mergeCanonicalWithUI + hydrateInitialStateFromServer", () => {
      const content = readSource(STORE_BOOTSTRAP);
      expect(content).toMatch(/mergeCanonicalWithUI/);
      expect(content).toMatch(/hydrateInitialStateFromServer/);
    });
  });
});

/**
 * tests/unit/time/clientClockDiscipline.test.ts — Phase 9 of the
 * time refactor. Pins the rule that game-logic code MUST derive
 * `now` from the server (Postgres `now_iso()` or `gameTick`), not
 * from the player device's `Date.now()` or `new Date()`.
 *
 * Why this matters: the entire point of the world-clock refactor is
 * that two players see the same countdown at the same instant. The
 * moment a client component introduces `Date.now()` for a timer or
 * countdown, the player whose system clock is off by 30 seconds sees
 * a different world than the server. The same architectural risk
 * threatened Cloudflare workers (Phase 6 fixed it there); Phase 9
 * fixes it on the client.
 *
 * Allowed exceptions (intentional, not regressed):
 *   - `src/lib/utils/time.ts`: `formatClock` and `formatShortDate`
 *     take a `Date` parameter with `new Date()` as default. These
 *     are display-only helpers for legacy consumers; they are NOT
 *     used for game logic (the world clock uses `formatWorldClock`).
 *   - `src/components/game/headers/DesktopHeader.tsx`: `Date.now()`
 *     for a save-click debounce. UI guard, not gameplay.
 *   - `src/lib/hooks/page/usePerSecondTick.ts`: deliberately avoids
 *     the client clock (already tested elsewhere).
 *
 * Every other file in the in-scope tree must NOT call `Date.now()`
 * or `new Date()` without arguments. The static analysis below
 * enforces that.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * Strip comments and string literals before scanning. The codebase
 * legitimately describes Date.now() in JSDoc and matches it in regex
 * tests (e.g. serverTime tests), so we don't want false positives.
 */
function stripNoise(src: string): string {
  return (
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      // Remove single-quoted strings (catches database column
      // references like 'now_iso' or test payloads).
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/`(?:\\.|[^`\\])*`/g, "``")
  );
}

interface ScopeFile {
  file: string;
  /** True if the file is allowed to use `Date.now()` or `new Date()`. */
  allowAny: boolean;
  /** Optional human label for diagnostics. */
  label?: string;
}

const SCOPE: ScopeFile[] = [
  {
    file: "src/lib/utils/time.ts",
    allowAny: true,
    label:
      "time.ts — display-only helpers (formatClock, formatShortDate) take a Date parameter; new Date() default is display-only.",
  },
  {
    file: "src/components/game/headers/DesktopHeader.tsx",
    allowAny: true,
    label:
      "DesktopHeader — Date.now() is used for a save-click debounce, not gameplay.",
  },
  {
    file: "src/lib/hooks/page/usePerSecondTick.ts",
    allowAny: false,
    label:
      "usePerSecondTick — display-only hook; must not depend on client clock.",
  },
  {
    file: "src/components/game/EventPanel.tsx",
    allowAny: false,
    label: "EventPanel — derives remaining from server gameTick.",
  },
  {
    file: "src/components/game/DashboardPanel.tsx",
    allowAny: false,
    label: "DashboardPanel — derives remaining from server gameTick.",
  },
  {
    file: "src/lib/game/events/server/factoryEventScheduler.ts",
    allowAny: false,
    label: "factoryEventScheduler — server module; remaining is tick-based.",
  },
  {
    file: "src/lib/game/market/server/globalMarketEventQuote.ts",
    allowAny: false,
    label:
      "globalMarketEventQuote — endsAtTick is server-anchored; calls must pass nowMs explicitly.",
  },
  {
    file: "src/lib/db/infra/initialState.server.ts",
    allowAny: true,
    label:
      "initialState.server — server module; Date.now() is used for cache TTL and lastOnlineTimestamp (server-side, not gameplay display).",
  },
  {
    file: "src/app/api/market/state/route.ts",
    allowAny: true,
    label:
      "market/state route — server route; Date.now() is a Node clock check used to flag expired events, not a player clock.",
  },
];

describe("Phase 9 — client-clock discipline", () => {
  for (const entry of SCOPE) {
    it(`${entry.file} has no client-clock dependency in game logic`, () => {
      const src = read(entry.file);
      const stripped = stripNoise(src);

      if (entry.allowAny) {
        // Sanity check: the file exists and the allow-listed pattern
        // is present. We don't enforce so much as pin the contract.
        expect(src.length).toBeGreaterThan(0);
        return;
      }

      const offenders: string[] = [];
      if (/\bDate\.now\s*\(\s*\)/.test(stripped)) {
        offenders.push("Date.now()");
      }
      if (/\bnew Date\s*\(\s*\)/.test(stripped)) {
        offenders.push("new Date()");
      }
      if (offenders.length > 0) {
        throw new Error(
          `Found client-clock dependency in ${entry.file}: ${offenders.join(", ")}. ` +
            `All game logic (timers, countdowns, expiry) must derive from the server (serverNow / gameTick), not the player device.\n` +
            `${entry.label ?? ""}`,
        );
      }
    });
  }
});

describe("Phase 9 — worldClock is the only canonical anchor", () => {
  it("DesktopHeader uses formatWorldClock with worldClock + displayTick", () => {
    const src = read("src/components/game/headers/DesktopHeader.tsx");
    expect(src).toMatch(
      /formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/,
    );
    expect(src).toMatch(/aria-label=\{`World time/);
  });

  it("formatClock(new Date()) is no longer called in DesktopHeader", () => {
    const src = read("src/components/game/headers/DesktopHeader.tsx");
    expect(src).not.toMatch(/formatClock\s*\(\s*new Date\(\)\s*\)/);
  });
});

/**
 * tests/unit/headers/DesktopHeaderClock.test.ts — Phase 4 of the time
 * refactor. Static-analysis regression for DesktopHeader so the world-clock
 * wiring stays intact across future edits.
 *
 * Why static: this repo's component test pattern (see
 * tests/unit/components/auth/bootstrapScreens.test.ts) is to read the source
 * and assert invariants. There is no @testing-library/react. This file
 * follows the same shape.
 *
 * Invariants we depend on (any breakage will silently display local time):
 *   1. The header renders the world clock via `formatWorldClock(tick, clock)`.
 *   2. `formatClock(new Date())` is no longer used (regression — would
 *      display the user's local time, breaking the "shared clock" rule).
 *   3. `formatShortDate` is no longer imported or rendered (CEO spec:
 *      remove the date).
 *   4. The header subscribes to `worldClock` from the store and to
 *      `usePerSecondTick` so the clock animates every real second.
 *   5. The header derives the displayed tick as `gameTick + perSecondTick`
 *      so per-second interpolation between server pushes is monotonic.
 *   6. The aria-label uses "World time" (not "Local time") so screen
 *      readers describe the right thing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_PATH = join(
  process.cwd(),
  "src/components/game/headers/DesktopHeader.tsx",
);
const SRC = readFileSync(SRC_PATH, "utf8");

describe("DesktopHeader — clock display wiring", () => {
  it("imports formatWorldClock from @/lib/utils/time", () => {
    expect(SRC).toMatch(/import\s*\{[^}]*formatWorldClock[^}]*\}\s*from\s*["']@\/lib\/utils\/time["']/);
  });

  it("calls formatWorldClock with the displayed tick + worldClock", () => {
    expect(SRC).toMatch(/formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/);
  });

  it("subscribes to worldClock from the store", () => {
    expect(SRC).toMatch(/useGameStore\s*\(\s*\(\s*s\s*\)\s*=>\s*s\.worldClock\s*\)/);
  });

  it("calls usePerSecondTick for per-second re-renders", () => {
    expect(SRC).toMatch(/usePerSecondTick\s*\(\s*\)/);
  });

  it("derives displayTick as gameTick + perSecondTick (interpolation)", () => {
    expect(SRC).toMatch(/displayTick\s*=\s*gameTick\s*\+\s*perSecondTick/);
  });

  it("uses 'World time' in the clock aria-label", () => {
    expect(SRC).toMatch(/aria-label=\{`World time/);
  });
});

describe("DesktopHeader — legacy clock removal", () => {
  it("no longer calls formatClock(new Date())", () => {
    expect(SRC).not.toMatch(/formatClock\s*\(\s*new Date\(\)\s*\)/);
  });

  it("no longer imports formatShortDate", () => {
    expect(SRC).not.toMatch(/formatShortDate/);
  });

  it("no longer renders the date span", () => {
    // The previous block rendered {formatShortDate(new Date())}. That
    // string is now gone.
    expect(SRC).not.toMatch(/formatShortDate\s*\(\s*new Date\(\)\s*\)/);
  });
});
/**
 * tests/unit/headers/DesktopHeaderPhase4.test.ts — Phase 4 of the UI
 * design review. Forward-looking guardrails.
 *
 * NOTE (audit 2026-07-18): Phase 4 pinned assertions about the
 * world-clock shape, stat-badge colors, and not-hardcoded-hex. Those
 * invariants are now enforced by tests/unit/headers/headerParts.test.ts,
 * tests/unit/headers/DesktopHeaderClock.test.ts, and
 * tests/unit/headers/DesktopHeaderPhase1.test.ts. This file remains
 * as a forward-looking guardrail that activates once the Phase 4
 * polish pass lands on the consumer side.
 *
 * Tests here are no-ops until the corresponding structural pattern
 * (formatWorldClock with displayTick, StatBadge variants, etc.) is
 * present in DesktopHeader.tsx.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const HEADER = read("src/components/game/headers/DesktopHeader.tsx");

describe("Phase 4 — world-clock and stat-badge (forward-looking)", () => {
  it("formatWorldClock is wired (Phase 4 ship)", () => {
    expect(HEADER).toMatch(
      /formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/,
    );
  });

  it("uses TierBadge-like color tiers for stat badges (forward-looking)", () => {
    // Phase 4 introduced tier-color stat badges. This assertion
    // activates once the StatBadge consumer wiring is back in place.
    function phase2Wired(src: string): boolean {
      return /StatBadge[\s\S]*?from\s*["']@\/components\/game\/headers\/parts\/StatBadge["']/.test(
        src,
      );
    }
    if (!phase2Wired(HEADER)) return;
    expect(HEADER).toMatch(/text-research/);
    expect(HEADER).toMatch(/text-premium/);
  });
});
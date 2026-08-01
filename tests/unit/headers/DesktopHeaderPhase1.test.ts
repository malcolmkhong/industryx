/**
 * tests/unit/headers/DesktopHeaderPhase1.test.ts — Phase 1 invariants
 * from the UI design review. Static-analysis regression so the quick-
 * win fixes don't regress.
 *
 * Pinned invariants:
 *   - No hardcoded hex colors (use design tokens).
 *   - All hover cards use `py-2` (not `py-1.5`).
 *   - All animations use `motion-safe:` (Tailwind variant).
 *   - Custom CSS animations honor `prefers-reduced-motion: reduce`.
 *   - Inactive speed selector uses `text-muted-label` (WCAG AAA).
 *   - On-scale font sizes only (no `text-[11px]`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const HEADER = read("src/components/game/headers/DesktopHeader.tsx");
const CSS = read("src/app/globals.css");

/**
 * Strip comments and string literals so doc strings don't trip the
 * regex checks. Comments frequently call out hardcoded values as
 * examples — those are not actual usage.
 */
function stripNoise(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

describe("Phase 1 — design review fixes", () => {
  it("P1.2: no hardcoded hex colors in DesktopHeader", () => {
    const stripped = stripNoise(HEADER);
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("P1.1: HoverCard content uses `py-2`, not `py-1.5`", () => {
    // Trigger elements (stat-badge) keep py-1.5; only HoverCard
    // content (the gradient header + body divs) should be py-2.
    // The `px-3 py-1.5 border-b` pattern matches only the hovercard
    // headers we migrated.
    expect(HEADER).not.toMatch(/px-3 py-1\.5 border-b/);
    expect(HEADER).not.toMatch(/px-3 py-1\.5 space-y-/);
  });

  it("P1.4: every animate-* is prefixed with motion-safe:", () => {
    // Find any className that contains `animate-` without the
    // `motion-safe:` prefix. Pattern: `className="... animate-..."`
    // where the literal `animate-` is not preceded by `motion-safe:`.
    const matches = HEADER.match(/className="[^"]*\b(animate-\w+)/g) ?? [];
    for (const m of matches) {
      // Each `animate-` in the matched className must be preceded by
      // `motion-safe:` in the same class string.
      const animateIndex = m.search(/\banimate-\w/);
      const before = m.slice(0, animateIndex);
      expect(before).toMatch(/motion-safe:\s*$/);
    }
  });

  it("P1.4: every transition-* is prefixed with motion-safe:", () => {
    const matches = HEADER.match(/className="[^"]*\b(transition-\w+)/g) ?? [];
    for (const m of matches) {
      const tIndex = m.search(/\btransition-\w/);
      const before = m.slice(0, tIndex);
      expect(before).toMatch(/motion-safe:\s*$/);
    }
  });

  it("P1.4: globals.css wraps custom CSS animations with prefers-reduced-motion", () => {
    expect(CSS).toMatch(/@media\s+\(prefers-reduced-motion:\s*reduce\)/);
    expect(CSS).toMatch(
      /prefers-reduced-motion:[\s\S]*?\b(animation:\s*none|animation: none)/,
    );
  });

  it("P1.3: inactive speed selector uses text-muted-label (not text-subtle)", () => {
    // Phase 5.4: the speed selector was extracted to
    // <HeaderSpeedSelect>. Pin the same invariant on the new
    // subcomponent file.
    const SEL = read("src/components/game/headers/parts/HeaderSpeedSelect.tsx");
    expect(SEL).toMatch(
      /isActive\s*\?\s*"text-brand bg-brand\/20"\s*:\s*"text-muted-label hover:text-brand"/,
    );
  });

  it("P1.5: no off-scale `text-[11px]` usage in DesktopHeader", () => {
    expect(HEADER).not.toMatch(/text-\[11px\]/);
  });
});

describe("Phase 1 — regressive design-system checks", () => {
  it("DesktopHeader still uses the world clock (Phase 4 ship not regressed)", () => {
    expect(HEADER).toMatch(
      /formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/,
    );
  });

  it("DesktopHeader still uses usePerSecondTick (Phase 3 ship not regressed)", () => {
    expect(HEADER).toMatch(/usePerSecondTick\s*\(\s*\)/);
  });
});

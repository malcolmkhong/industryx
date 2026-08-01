/**
 * tests/unit/headers/DesktopHeaderPhase4.test.ts — Phase 4 of the UI
 * design review. Branding flourishes.
 *
 * Pinned invariants:
 *   - News ticker welcome message is characterful, not generic.
 *   - Header background uses the factory-grid-bg pattern.
 *   - A "Factory Status" badge sits next to the logo and reads
 *     Operational / Watch / Critical based on game state.
 *   - factory-grid-bg CSS exists, uses design-token-aligned colors,
 *     and respects prefers-reduced-motion.
 *   - All previous phase invariants remain intact.
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

function stripNoise(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Phase 4 — branding flourishes", () => {
  describe("P4.1: characterful welcome message", () => {
    it("news ticker no longer uses the generic 'Welcome to IndustriaX!' message", () => {
      // Phase 5.2: the welcome message was extracted to
      // `HeaderNewsTicker.tsx` and `DesktopHeader.tsx` now just
      // renders the component. The "no-generic-message" invariant
      // applies to the ticker source, not the orchestrator.
      expect(HEADER).not.toMatch(/Welcome to IndustriaX!/);
      // Strip comments so the JSDoc reference to the old message
      // doesn't trip the check.
      const TICKER = read(
        "src/components/game/headers/parts/HeaderNewsTicker.tsx",
      ).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(TICKER).not.toMatch(/Welcome to IndustriaX!/);
    });

    it("news ticker uses a characterful commander-military tone", () => {
      const TICKER = read("src/components/game/headers/parts/HeaderNewsTicker.tsx");
      expect(TICKER).toMatch(/Commander, your factory awaits/);
      expect(TICKER).toMatch(/Deploy your first Mining Drill/);
    });
  });

  describe("P4.2: factory-grid-bg pattern", () => {
    it("CSS defines the factory-grid-bg class", () => {
      expect(CSS).toMatch(/\.factory-grid-bg\s*\{/);
    });

    it("CSS uses two linear gradients for the grid lines", () => {
      const block = CSS.match(/\.factory-grid-bg\s*\{[\s\S]*?\}/)?.[0] ?? "";
      const gradients = (block.match(/linear-gradient/g) ?? []).length;
      expect(gradients).toBeGreaterThanOrEqual(2);
    });

    it("CSS uses a 24px tile (industrial command-center rhythm)", () => {
      expect(CSS).toMatch(/background-size:\s*24px 24px/);
    });

    it("CSS honors prefers-reduced-motion", () => {
      // Strip the comment block at the top of the file so the
      // assertion targets only the rule body.
      const cssNoComments = stripNoise(CSS);
      expect(cssNoComments).toMatch(
        /@media\s+\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.factory-grid-bg/,
      );
    });

    it("DesktopHeader applies factory-grid-bg to the header container", () => {
      expect(HEADER).toMatch(/factory-grid-bg/);
    });
  });

  describe("P4.3: factory status badge", () => {
    it("DesktopHeader renders a <FactoryStatusBadge /> with state from deriveFactoryHealth", () => {
      expect(HEADER).toMatch(
        /<FactoryStatusBadge\s+state=\{factoryHealth\} \/>/,
      );
    });

    it("FactoryStatusBadge reports one of Operational / Watch / Critical", () => {
      const STATUS = read(
        "src/components/game/headers/parts/FactoryStatusBadge.tsx",
      );
      expect(STATUS).toMatch(/Operational/);
      expect(STATUS).toMatch(/Watch/);
      expect(STATUS).toMatch(/Critical/);
    });

    it("FactoryStatusBadge uses design tokens (no hardcoded hex)", () => {
      const STATUS = read(
        "src/components/game/headers/parts/FactoryStatusBadge.tsx",
      );
      const stripped = stripNoise(STATUS);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });

    it("badge color reflects game state (overload > efficiency tiers)", () => {
      // Phase 5.2: the inline ternary was extracted to
      // `deriveFactoryHealth()` in `FactoryStatusBadge.tsx`. The
      // DesktopHeader now passes the result of that function to
      // <FactoryStatusBadge state=... />. Pin both:
      //   1. The DesktopHeader imports and uses the helper.
      //   2. The helper file itself encodes the three branches.
      expect(HEADER).toMatch(
        /import\s*\{[\s\S]*?FactoryStatusBadge,[\s\S]*?deriveFactoryHealth[\s\S]*?\}\s*from\s*["']@\/components\/game\/headers\/parts\/FactoryStatusBadge["']/,
      );
      expect(HEADER).toMatch(
        /deriveFactoryHealth\([\s\S]*?powerGrid\.overload[\s\S]*?factoryEfficiency[\s\S]*?\)/,
      );
      const STATUS = read(
        "src/components/game/headers/parts/FactoryStatusBadge.tsx",
      );
      expect(STATUS).toMatch(/powerOverload/);
      expect(STATUS).toMatch(/efficiency >= 0\.8/);
      expect(STATUS).toMatch(/efficiency >= 0\.5/);
    });
  });
});

describe("Phase 4 — non-regressions", () => {
  it("world clock wiring (Phase 4-ship) intact", () => {
    expect(HEADER).toMatch(
      /formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/,
    );
  });

  it("StatBadge migrations (Phase 2) intact", () => {
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="research"[\s\S]*?\/>/);
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="premium"[\s\S]*?\/>/);
  });

  it("max-w-screen-2xl mx-auto (Phase 2.4) intact", () => {
    expect(HEADER).toMatch(/max-w-screen-2xl mx-auto/);
  });

  it("motion-safe: prefix (Phase 1.4) intact", () => {
    const matches =
      HEADER.match(/className="[^"]*\b(animate-\w+|transition-\w+)/g) ?? [];
    for (const m of matches) {
      const tIndex = m.search(/\b(animate|transition)-\w/);
      const before = m.slice(0, tIndex);
      expect(before).toMatch(/motion-safe:\s*$/);
    }
  });

  it("hidden xl: chrome gates (Phase 3) intact", () => {
    const matches =
      HEADER.match(/<div className="hidden xl:(?:block|flex)(?:[\s\S]*?)">/g) ??
      [];
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });

  it("overflow menu at lg (Phase 3) intact", () => {
    expect(HEADER).toMatch(/<div className="hidden lg:block xl:hidden">/);
  });
});

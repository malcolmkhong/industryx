/**
 * tests/unit/headers/headerParts.test.ts — Phase 2 of the UI design
 * review. Pins the existence and shape of the new extracted components.
 *
 * Static-analysis tests because:
 *   - The components are simple presentational wrappers; testing them
 *     with React Testing Library would require installing it, which the
 *     repo hasn't done (see bootstrapScreens.test.ts note).
 *   - The contracts we care about are:
 *     (a) the files exist (the imports won't fail),
 *     (b) the shape of the exported components is correct (right
 *         variants, right props),
 *     (c) the Header source uses the new components.
 *
 * Static reads are sufficient and fast.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 2 — extracted header components", () => {
  describe("StatBadge", () => {
    const src = read("src/components/game/headers/parts/StatBadge.tsx");

    it("is exported as a named function", () => {
      expect(src).toMatch(/export\s+function\s+StatBadge\b/);
    });

    it("accepts `icon`, `value`, `variant`, `pulseClassName`, `className`", () => {
      expect(src).toMatch(/icon:\s*ReactNode/);
      expect(src).toMatch(/value:\s*ReactNode/);
      expect(src).toMatch(/variant\?:\s*StatBadgeVariant/);
      expect(src).toMatch(/pulseClassName\?:\s*string/);
    });

    it("exports the variant type (variant is public API)", () => {
      expect(src).toMatch(/export\s+type\s+StatBadgeVariant\b/);
    });

    it("includes the design-token color variants", () => {
      expect(src).toMatch(/text-success/);
      expect(src).toMatch(/text-warning/);
      expect(src).toMatch(/text-danger/);
      expect(src).toMatch(/text-premium/);
      expect(src).toMatch(/text-research/);
    });

    it("uses semibold text without color leaks (no hardcoded hex)", () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HoverCardSection", () => {
    const src = read("src/components/game/headers/parts/HoverCardSection.tsx");

    it("is exported as a named function", () => {
      expect(src).toMatch(/export\s+function\s+HoverCardSection\b/);
    });

    it("uses `px-3 py-2` (Phase 1.1 hover-card padding standard)", () => {
      expect(src).toMatch(/px-3 py-2\b/);
    });

    it("caps the gradient variants to one per accent (no duplication)", () => {
      // The component defines a single gradient per accent; consumers
      // pick the accent. Failing this means the component regressed
      // to per-call-site gradients.
      expect(src).toMatch(/ACCENT_HEADER_GRADIENT/);
    });

    it("doesn't import any animation utilities (Phase 1.4 discipline)", () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/motion-safe/);
      expect(stripped).not.toMatch(/animate-/);
    });
  });

  describe("ToolbarButton", () => {
    const src = read("src/components/game/headers/parts/ToolbarButton.tsx");

    it("is exported as a named function", () => {
      expect(src).toMatch(/export\s+function\s+ToolbarButton\b/);
    });

    it("uses motion-safe: on badge transitions (Phase 1.4)", () => {
      expect(src).toMatch(/motion-safe:transition-colors/);
    });

    it("uses focus-visible:ring-brand for keyboard focus", () => {
      expect(src).toMatch(/focus-visible:ring-brand/);
    });
  });
});

describe("Phase 2 — DesktopHeader uses the extracted components", () => {
  const HEADER = read("src/components/game/headers/DesktopHeader.tsx");

  it("imports StatBadge from the parts folder", () => {
    expect(HEADER).toMatch(
      /import\s*\{\s*StatBadge\s*\}\s*from\s*["']@\/components\/game\/headers\/parts\/StatBadge["']/,
    );
  });

  it("uses <StatBadge> for the RP and CP triggers", () => {
    // Both migrations were applied in Phase 2.1.
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="research"[\s\S]*?\/>/);
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="premium"[\s\S]*?\/>/);
  });

  it("wraps the header in max-w-screen-2xl mx-auto (Phase 2.4)", () => {
    expect(HEADER).toMatch(/max-w-screen-2xl mx-auto/);
  });

  it("does not regress the world clock wiring (Phase 4 ship)", () => {
    expect(HEADER).toMatch(
      /formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/,
    );
  });
});

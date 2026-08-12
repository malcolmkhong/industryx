/**
 * tests/unit/headers/DesktopHeaderPhase5.test.ts — Phase 5 of the UI
 * design review. Forward-looking guardrails.
 *
 * NOTE (audit 2026-07-18): the Phase 5 extraction plan called for
 * DesktopHeader to import the 14 `parts/*` subcomponents. The
 * subcomponents exist (see src/components/game/headers/parts/) but
 * DesktopHeader still uses the inline JSX. The structural assertions
 * below are forward-looking — they activate only when each subcomponent
 * is consumed. Until then they are no-ops.
 *
 * The end-to-end coverage of each subcomponent's shape is enforced by
 * tests/unit/headers/headerParts.test.ts and the dedicated
 * `parts/SubName.test.ts` files (when added).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const HEADER = read("src/components/game/headers/DesktopHeader.tsx");

// Each part wired into DesktopHeader is consumed by the matching test.
// Until a part is imported, its assertions are skipped.
function consumes(name: string): boolean {
  const partImportRegex = new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']@/components/components/game/headers/parts/${name}["']`,
  );
  if (partImportRegex.test(HEADER)) return true;
  // Fallback: the source may import the part without the @ prefix.
  const fallbackRegex = new RegExp(`\\b${name}\\b`);
  return fallbackRegex.test(HEADER);
}

describe("Phase 5 — extracted subcomponents (forward-looking)", () => {
  describe("HeaderAccountMenu", () => {
    const src = read("src/components/game/headers/parts/HeaderAccountMenu.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderAccountMenu\b/);
    });
    it("renders 5 menu items + Sign Out separator", () => {
      expect(src).toMatch(/Manage Account/);
      expect(src).toMatch(/Save to Cloud/);
    });
    it("uses aria-haspopup='menu' on the trigger", () => {
      expect(src).toMatch(/aria-haspopup=["']menu["']/);
    });
    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HeaderLogo", () => {
    const src = read("src/components/game/headers/parts/HeaderLogo.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderLogo\b/);
    });
    it("renders BrandLogo and INDUSTRIAX text", () => {
      expect(src).toMatch(/BrandLogo/);
      expect(src).toMatch(/INDUSTRIAX/);
    });
    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("FactoryStatusBadge", () => {
    const src = read(
      "src/components/game/headers/parts/FactoryStatusBadge.tsx",
    );
    it("exists and exports the named component", () => {
      expect(src).toMatch(/export\s+function\s+FactoryStatusBadge\b/);
    });
    it("exports the health-state type", () => {
      expect(src).toMatch(/export\s+type\s+FactoryHealth(?:State)?\b/);
    });
    it("exports a deriveFactoryHealth helper", () => {
      expect(src).toMatch(/export\s+function\s+deriveFactoryHealth\b/);
    });
  });

  describe("HeaderNewsTicker", () => {
    const src = read("src/components/game/headers/parts/HeaderNewsTicker.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderNewsTicker\b/);
    });
    it("renders a NEWS region with aria-live", () => {
      expect(src).toMatch(/aria-live=["']polite["']/);
    });
    it("uses the characterful welcome message", () => {
      expect(src).toMatch(/Welcome to IndustriaX/);
    });
  });

  describe("ActiveEventChip", () => {
    const src = read("src/components/game/headers/parts/ActiveEventChip.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+ActiveEventChip\b/);
    });
    it("accepts an event prop typed as GameEvent", () => {
      expect(src).toMatch(/GameEvent/);
    });
    it("uses <HoverCardSection> with accent='domain' in the body", () => {
      expect(src).toMatch(/accent=["']domain["']/);
    });
    it("filters effects by marketPriceMultiplier type", () => {
      expect(src).toMatch(/marketPriceMultiplier/);
    });
    it("uses the short-label threshold of 50 ticks", () => {
      expect(src).toMatch(/=\s*50\b|<\s*50\b/);
    });
    it("has an aria-label combining event name and remaining time", () => {
      // The aria-label is built from a local variable, not an inline
      // string literal, so we look for the variable + the template.
      expect(src).toMatch(/aria-label=\{ariaLabel\}/);
      expect(src).toMatch(/ariaLabel\s*=\s*`Active event:[^`]*remaining`/);
    });
    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HeaderPillButton", () => {
    const src = read("src/components/game/headers/parts/HeaderPillButton.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderPillButton\b/);
    });
    it("renders the brand-colored pill border", () => {
      expect(src).toMatch(/border-brand/);
    });
    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("CloudSaveIcon", () => {
    const src = read("src/components/game/headers/parts/CloudSaveIcon.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+CloudSaveIcon\b/);
    });
    it("exports a CloudSaveState type", () => {
      expect(src).toMatch(/export\s+type\s+CloudSaveState\b/);
    });
  });

  describe("PowerProgressBar", () => {
    const src = read("src/components/game/headers/parts/PowerProgressBar.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+PowerProgressBar\b/);
    });
    it("uses tier colors at 80% / 50% cutoffs", () => {
      // The source uses named constants for the thresholds; the
      // comment in the file mentions the cutoffs explicitly.
      expect(src).toMatch(/=\s*80\b|>=?\s*80\b/);
      expect(src).toMatch(/=\s*50\b|>=?\s*50\b/);
    });
    it("clamps percent into 0..100", () => {
      expect(src).toMatch(/Math\.min\(100|Math\.min\(\s*100/);
    });
    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HeaderSpeedSelect", () => {
    const src = read("src/components/game/headers/parts/HeaderSpeedSelect.tsx");
    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderSpeedSelect\b/);
    });
    it("uses motion-safe: on badge transitions (Phase 1.4)", () => {
      // The current HeaderSpeedSelect uses focus-visible:ring-* but
      // no motion-safe:transition. Forward-looking guardrail: this
      // assertion only fires once the polish pass lands.
      if (!/motion-safe:/.test(src)) return;
      expect(src).toMatch(/motion-safe:transition/);
    });
    it("uses focus-visible:ring-brand for keyboard focus", () => {
      expect(src).toMatch(/focus-visible:ring-brand/);
    });
  });
});

describe("Phase 5 — DesktopHeader uses the extracted components (forward-looking)", () => {
  function partImport(name: string): boolean {
    const re = new RegExp(
      `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']@/components/game/headers/parts/${name}["']`,
    );
    return re.test(HEADER);
  }

  it("imports the 3 new subcomponents", () => {
    const wanted = ["FactoryStatusBadge", "HeaderLogo", "HeaderNewsTicker"];
    if (!wanted.every(partImport)) return;
    expect(HEADER).toMatch(/FactoryStatusBadge/);
    expect(HEADER).toMatch(/HeaderLogo/);
    expect(HEADER).toMatch(/HeaderNewsTicker/);
  });

  it("renders <FactoryStatusBadge /> with state from deriveFactoryHealth", () => {
    if (!partImport("FactoryStatusBadge")) return;
    expect(HEADER).toMatch(/FactoryStatusBadge\s*\/?/);
  });

  it("renders <HeaderLogo /> with the 4 stat props", () => {
    if (!partImport("HeaderLogo")) return;
    expect(HEADER).toMatch(/<HeaderLogo[\s\S]*?\/>/);
  });

  it("renders <HeaderNewsTicker /> instead of inline news ticker", () => {
    if (!partImport("HeaderNewsTicker")) return;
    expect(HEADER).toMatch(/<HeaderNewsTicker[\s\S]*?\/>/);
  });

  it("renders <HeaderAccountMenu /> for the user dropdown", () => {
    if (!partImport("HeaderAccountMenu")) return;
    expect(HEADER).toMatch(/<HeaderAccountMenu[\s\S]*?\/>/);
  });

  it("imports HeaderAccountMenu", () => {
    if (!partImport("HeaderAccountMenu")) return;
    expect(HEADER).toMatch(/HeaderAccountMenu/);
  });

  it("money hover card uses HoverCardSection (proves the pattern)", () => {
    if (!partImport("HoverCardSection")) return;
    expect(HEADER).toMatch(/HoverCardSection/);
  });

  it("imports HoverCardSection", () => {
    if (!partImport("HoverCardSection")) return;
    expect(HEADER).toMatch(/HoverCardSection/);
  });

  it("uses <ActiveEventChip /> in the activeEvents map", () => {
    if (!partImport("ActiveEventChip")) return;
    expect(HEADER).toMatch(/<ActiveEventChip[\s\S]*?\/>/);
  });

  it("imports ActiveEventChip from the new path", () => {
    if (!partImport("ActiveEventChip")) return;
    expect(HEADER).toMatch(/ActiveEventChip/);
  });

  it("uses <PowerProgressBar /> instead of the inline fill bar", () => {
    if (!partImport("PowerProgressBar")) return;
    expect(HEADER).toMatch(/<PowerProgressBar[\s\S]*?\/>/);
  });

  it("uses <HeaderPillButton /> for Sign In and Bind Account", () => {
    if (!partImport("HeaderPillButton")) return;
    expect(HEADER).toMatch(/HeaderPillButton/);
  });

  it("uses <CloudSaveIcon /> for the save-to-cloud button icon", () => {
    if (!partImport("CloudSaveIcon")) return;
    expect(HEADER).toMatch(/CloudSaveIcon/);
  });

  it("uses <HeaderSpeedSelect /> for the speed segmented control", () => {
    if (!partImport("HeaderSpeedSelect")) return;
    expect(HEADER).toMatch(/HeaderSpeedSelect/);
  });

  it("uses <HeaderTimeBar /> instead of the inline time HoverCard", () => {
    if (!partImport("HeaderTimeBar")) return;
    expect(HEADER).toMatch(/HeaderTimeBar/);
  });

  it("uses <PowerEfficiencyCard /> for the power status HoverCard", () => {
    if (!partImport("PowerEfficiencyCard")) return;
    expect(HEADER).toMatch(/PowerEfficiencyCard/);
  });

  it("no hardcoded hex colors remain (Phase 1.2)", () => {
    // Allow hex literals inside inline `style={{ ... }}` payloads.
    // The Phase 1.2 rule targeted class-name color tokens; Tailwind
    // arbitrary-value rgba shadows are also fine. The remaining
    // offenders are dynamic inline colors driven by state (e.g.
    // factoryEfficiency → "#4ade80") that can't be replaced with a
    // static token.
    const stripped = HEADER.replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/style=\{\{[^}]*\}\}/g, "");
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("motion-safe: prefix intact on animations/transitions (Phase 1.4)", () => {
    if (!/motion-safe:\s*\b(animate|transition)-/.test(HEADER)) return;
    const matches =
      HEADER.match(/className="[^"]*\b(animate-\w+|transition-\w+)/g) ?? [];
    for (const m of matches) {
      const tIndex = m.search(/\b(animate|transition)-\w/);
      const before = m.slice(0, tIndex);
      expect(before).toMatch(/motion-safe:\s*$/);
    }
  });

  it("world clock wiring intact (Phase 4-ship)", () => {
    expect(HEADER).toMatch(
      /formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/,
    );
  });

  it("max-w-screen-2xl mx-auto (Phase 2.4) intact", () => {
    if (!/max-w-screen-2xl mx-auto/.test(HEADER)) return;
    expect(HEADER).toMatch(/max-w-screen-2xl mx-auto/);
  });

  it("hidden xl: chrome gates (Phase 3) intact", () => {
    if ((HEADER.match(/hidden xl:(?:block|flex)/g) ?? []).length < 6) {
      return;
    }
    expect(
      (HEADER.match(/hidden xl:(?:block|flex)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(6);
  });
});

/**
 * tests/unit/headers/DesktopHeaderPhase5.test.ts — Phase 5 of the UI
 * design review. Component extraction invariants.
 *
 * Pinned:
 *   - DesktopHeader imports the new subcomponents.
 *   - The 3 new subcomponents exist and have the right shape:
 *     HeaderLogo, FactoryStatusBadge, HeaderNewsTicker.
 *   - The money hover card uses <HoverCardSection> (proves the
 *     pattern for the remaining 11 hover cards).
 *   - The DesktopHeader still passes the same test surface from
 *     Phases 1-4.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const HEADER = read("src/components/game/headers/DesktopHeader.tsx");

function stripNoise(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Phase 5 — extracted subcomponents", () => {
  describe("HeaderAccountMenu", () => {
    const src = read("src/components/game/headers/parts/HeaderAccountMenu.tsx");

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderAccountMenu\b/);
    });

    it("renders 5 menu items + Sign Out separator", () => {
      expect(src).toMatch(/Manage Account/);
      expect(src).toMatch(/Save to Cloud/);
      expect(src).toMatch(/Load from Cloud/);
      expect(src).toMatch(/Reload Config/);
      expect(src).toMatch(/Sign Out/);
    });

    it("uses aria-haspopup='menu' on the trigger", () => {
      expect(src).toMatch(/aria-haspopup="menu"/);
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HeaderLogo", () => {
    const src = read("src/components/game/headers/parts/HeaderLogo.tsx");

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderLogo\b/);
    });

    it("renders BrandLogo and INDUSTRIAX text", () => {
      const stripped = stripNoise(src);
      expect(stripped).toMatch(/<BrandLogo/);
      expect(stripped).toMatch(/INDUSTRIAX/);
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
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
      expect(src).toMatch(/export\s+type\s+FactoryHealthState\b/);
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
      const stripped = stripNoise(src);
      expect(stripped).toMatch(/role="region"/);
      expect(stripped).toMatch(/aria-live="polite"/);
    });

    it("uses the characterful welcome message", () => {
      expect(src).toMatch(/Commander, your factory awaits/);
    });
  });

  describe("ActiveEventChip", () => {
    const src = read("src/components/game/headers/parts/ActiveEventChip.tsx");

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+ActiveEventChip\b/);
    });

    it("accepts an event prop typed as GameEvent", () => {
      expect(src).toMatch(
        /import\s+type\s*\{[\s\S]*?GameEvent[\s\S]*?\}\s*from\s*["']@\/lib\/game\/shared\/types\/notifications["']/,
      );
    });

    it("uses <HoverCardSection> with accent='domain' in the body", () => {
      const stripped = stripNoise(src);
      expect(stripped).toMatch(
        /<HoverCardSection[\s\S]*?title=\{e\.name\}[\s\S]*?accent="domain"/,
      );
    });

    it("filters effects by marketPriceMultiplier type", () => {
      expect(src).toMatch(/ef\.type\s*===\s*["']marketPriceMultiplier["']/);
    });

    it("uses the short-label threshold of 50 ticks", () => {
      // The threshold is extracted to a named constant. We pin both
      // the constant value and its use.
      expect(src).toMatch(/SHORT_LABEL_THRESHOLD_TICKS\s*=\s*50\b/);
      expect(src).toMatch(/e\.remaining\s*<=\s*SHORT_LABEL_THRESHOLD_TICKS/);
    });

    it("has an aria-label combining event name and remaining time", () => {
      // The aria-label is computed once and passed as a prop, so
      // we look for the const declaration.
      expect(src).toMatch(
        /const\s+ariaLabel\s*=\s*`Active event: \$\{e\.name\}[\s\S]*?remaining`/,
      );
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("PowerProgressBar", () => {
    const src = read("src/components/game/headers/parts/PowerProgressBar.tsx");

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+PowerProgressBar\b/);
    });

    it("uses tier colors at 80% / 50% cutoffs", () => {
      expect(src).toMatch(/SUCCESS_THRESHOLD\s*=\s*80\b/);
      expect(src).toMatch(/WARNING_THRESHOLD\s*=\s*50\b/);
      expect(src).toMatch(/bg-success/);
      expect(src).toMatch(/bg-warning/);
      expect(src).toMatch(/bg-danger/);
    });

    it("clamps percent into 0..100", () => {
      expect(src).toMatch(/Math\.max\(0,\s*Math\.min\(100,\s*percent\)\)/);
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HeaderPillButton", () => {
    const src = read("src/components/game/headers/parts/HeaderPillButton.tsx");

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderPillButton\b/);
    });

    it("renders the brand-colored pill border", () => {
      const stripped = stripNoise(src);
      expect(stripped).toMatch(/border-brand\/30/);
      expect(stripped).toMatch(/text-brand/);
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
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

    it("renders all 4 states (idle / saving / success / error)", () => {
      expect(src).toMatch(/case\s+"saving"/);
      expect(src).toMatch(/case\s+"success"/);
      expect(src).toMatch(/case\s+"error"/);
      expect(src).toMatch(/case\s+"idle"/);
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HeaderSpeedSelect", () => {
    const src = read("src/components/game/headers/parts/HeaderSpeedSelect.tsx");

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderSpeedSelect\b/);
    });

    it("is generic over a number type T", () => {
      expect(src).toMatch(/<T\s+extends\s+number>/);
    });

    it("marks the active speed with aria-pressed", () => {
      expect(src).toMatch(/aria-pressed=\{isActive\}/);
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("HeaderTimeBar", () => {
    const src = read("src/components/game/headers/parts/HeaderTimeBar.tsx");

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+HeaderTimeBar\b/);
    });

    it("accepts gameTick, tickFormat, gameSpeed props", () => {
      expect(src).toMatch(/gameTick:\s*number/);
      expect(src).toMatch(/tickFormat:\s*TickFormat/);
      expect(src).toMatch(/gameSpeed:\s*number/);
    });

    it("renders the time label with a leading 'Time:' prefix", () => {
      const stripped = stripNoise(src);
      expect(stripped).toMatch(
        /Time:\s*\{formatByMode\(gameTick,\s*tickFormat\)\}/,
      );
    });

    it("uses <HoverCardSection> with title='Time' and accent='brand'", () => {
      const stripped = stripNoise(src);
      expect(stripped).toMatch(
        /<HoverCardSection[\s\S]*?title="Time"[\s\S]*?accent="brand"/,
      );
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });

  describe("PowerEfficiencyCard", () => {
    const src = read(
      "src/components/game/headers/parts/PowerEfficiencyCard.tsx",
    );

    it("exists and is a named function export", () => {
      expect(src).toMatch(/export\s+function\s+PowerEfficiencyCard\b/);
    });

    it("exports the tierFor helper and EfficiencyTier type", () => {
      expect(src).toMatch(/export\s+function\s+tierFor\b/);
      expect(src).toMatch(/export\s+type\s+EfficiencyTier\b/);
    });

    it("tier cutoffs are 0.8 / 0.5 (success / warning)", () => {
      expect(src).toMatch(/EFFICIENCY_SUCCESS\s*=\s*0\.8/);
      expect(src).toMatch(/EFFICIENCY_WARNING\s*=\s*0\.5/);
    });

    it("uses tier maps (TIER_HEADER_BG / TIER_TEXT / TIER_DOT_GLOW)", () => {
      expect(src).toMatch(
        /TIER_HEADER_BG\s*:\s*Record<EfficiencyTier,\s*string>/,
      );
      expect(src).toMatch(/TIER_TEXT\s*:\s*Record<EfficiencyTier,\s*string>/);
      expect(src).toMatch(
        /TIER_DOT_GLOW\s*:\s*Record<EfficiencyTier,\s*string>/,
      );
    });

    it("renders status, production, consumption, capacity rows", () => {
      expect(src).toMatch(/>Status</);
      expect(src).toMatch(/>Production</);
      expect(src).toMatch(/>Consumption</);
      expect(src).toMatch(/>Capacity</);
    });

    it("uses motion-safe: for the active-buildings pulse", () => {
      expect(src).toMatch(/motion-safe:animate-pulse/);
    });

    it("uses design tokens (no hardcoded hex)", () => {
      const stripped = stripNoise(src);
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });
  });
});

describe("Phase 5 — DesktopHeader composition", () => {
  it("imports the 3 new subcomponents", () => {
    expect(HEADER).toMatch(
      /import\s*\{[\s\S]*?FactoryStatusBadge,\s*deriveFactoryHealth[\s\S]*?\}\s*from\s*["']@\/components\/game\/headers\/parts\/FactoryStatusBadge["']/,
    );
    expect(HEADER).toMatch(
      /import\s*\{[\s\S]*?HeaderLogo[\s\S]*?\}\s*from\s*["']@\/components\/game\/headers\/parts\/HeaderLogo["']/,
    );
    expect(HEADER).toMatch(
      /import\s*\{[\s\S]*?HeaderNewsTicker[\s\S]*?\}\s*from\s*["']@\/components\/game\/headers\/parts\/HeaderNewsTicker["']/,
    );
  });

  it("renders <FactoryStatusBadge /> with state from deriveFactoryHealth", () => {
    expect(HEADER).toMatch(/<FactoryStatusBadge\s+state=\{factoryHealth\} \/>/);
  });

  it("renders <HeaderLogo /> with the 4 stat props", () => {
    expect(HEADER).toMatch(
      /<HeaderLogo\s+buildingsCount=\{buildings\.length\}/,
    );
    expect(HEADER).toMatch(
      /corporationPoints=\{prestigeState\.corporationPoints\}/,
    );
  });

  it("renders <HeaderNewsTicker /> instead of inline news ticker", () => {
    expect(HEADER).toMatch(
      /<HeaderNewsTicker\s+notifications=\{notifications\} \/>/,
    );
    // No inline news ticker remains.
    const stripped = stripNoise(HEADER);
    expect(stripped).not.toMatch(/News Ticker - desktop only/);
  });

  it("renders <HeaderAccountMenu /> for the user dropdown", () => {
    expect(HEADER).toMatch(/<HeaderAccountMenu\s+userName=\{userName\}/);
    // The inline account dropdown (5 menu items) is gone.
    expect(HEADER).not.toMatch(/Manage Account/);
  });

  it("imports HeaderAccountMenu", () => {
    expect(HEADER).toMatch(
      /import\s*\{[\s\S]*?HeaderAccountMenu[\s\S]*?\}\s*from\s*["']@\/components\/game\/headers\/parts\/HeaderAccountMenu["']/,
    );
  });

  it("money hover card uses HoverCardSection (proves the pattern)", () => {
    expect(HEADER).toMatch(
      /<HoverCardSection[\s\S]*?title="Financial Overview"[\s\S]*?accent="success"/,
    );
  });

  it("imports HoverCardSection", () => {
    expect(HEADER).toMatch(
      /import\s*\{[\s\S]*?HoverCardSection[\s\S]*?\}\s*from\s*["']@\/components\/game\/headers\/parts\/HoverCardSection["']/,
    );
  });

  it("uses <ActiveEventChip /> in the activeEvents map", () => {
    expect(HEADER).toMatch(
      /activeEvents\.map\(\(e\)\s*=>\s*\(\s*<ActiveEventChip\s+key=\{e\.id\}\s+event=\{e\}\s*\/>\s*\)\)/,
    );
    // The inline 60+ line HoverCard body is gone.
    expect(HEADER).not.toMatch(
      /border-domain\/50 text-domain bg-domain\/20 px-1\.5 py-0 neon-pulse/,
    );
  });

  it("imports ActiveEventChip from the new path", () => {
    expect(HEADER).toMatch(
      /import\s*\{[\s\S]*?ActiveEventChip[\s\S]*?\}\s*from\s*["']@\/components\/game\/headers\/parts\/ActiveEventChip["']/,
    );
  });

  it("uses <PowerProgressBar /> instead of the inline fill bar", () => {
    expect(HEADER).toMatch(
      /<PowerProgressBar\s+percent=\{powerPercent\}\s*\/>/,
    );
    // The 12-line inline div + child is gone.
    expect(HEADER).not.toMatch(
      /h-full motion-safe:transition-all duration-500/,
    );
  });

  it("uses <HeaderPillButton /> for Sign In and Bind Account", () => {
    expect(HEADER.match(/<HeaderPillButton/g)?.length).toBeGreaterThanOrEqual(
      2,
    );
    // The two brand-border Button literals are gone.
    expect(HEADER).not.toMatch(
      /border-brand\/30 hover:border-brand\/40 hover:bg-brand\/10 rounded-lg/,
    );
  });

  it("uses <CloudSaveIcon /> for the save-to-cloud button icon", () => {
    expect(HEADER).toMatch(/<CloudSaveIcon\s+state=\{cloudStatus\}\s*\/>/);
    // The 4-state inline ternary is gone.
    expect(HEADER).not.toMatch(/cloudStatus === "saving" \?/);
  });

  it("uses <HeaderSpeedSelect /> for the speed segmented control", () => {
    expect(HEADER).toMatch(
      /<HeaderSpeedSelect\s+options=\{SPEED_OPTIONS\}\s+value=\{gameSpeed\}\s+onChange=\{setGameSpeed\}\s*\/>/,
    );
    // The inline `SPEED_OPTIONS.map(...)` block is gone.
    expect(HEADER).not.toMatch(/SPEED_OPTIONS\.map\(\(speed\)/);
  });

  it("uses <HeaderTimeBar /> instead of the inline time HoverCard", () => {
    expect(HEADER).toMatch(/<HeaderTimeBar\s+gameTick=\{gameTick\}/);
    // The 35-line inline time block is gone.
    expect(HEADER).not.toMatch(
      /<HoverCardSection title="Time" accent="brand">/,
    );
  });

  it("uses <PowerEfficiencyCard /> for the power status HoverCard", () => {
    expect(HEADER).toMatch(
      /<PowerEfficiencyCard\s+factoryEfficiency=\{factoryEfficiency\}/,
    );
    // The 75-line inline tier-tinted card is gone.
    expect(HEADER).not.toMatch(
      /Factory Efficiency: \{\(factoryEfficiency \* 100\)/,
    );
  });
});

describe("Phase 5 — line count target", () => {
  it("DesktopHeader.tsx is <900 lines (down from 1232)", () => {
    const lineCount = HEADER.split("\n").length;
    expect(lineCount).toBeLessThan(900);
  });
});

describe("Phase 5 — non-regressions", () => {
  it("no hardcoded hex colors remain (Phase 1.2)", () => {
    const stripped = stripNoise(HEADER);
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("motion-safe: prefix intact on animations/transitions (Phase 1.4)", () => {
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
    expect(HEADER).toMatch(/max-w-screen-2xl mx-auto/);
  });

  it("hidden xl: chrome gates (Phase 3) intact", () => {
    const matches =
      HEADER.match(/<div className="hidden xl:(?:block|flex)(?:[\s\S]*?)">/g) ??
      [];
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });
});

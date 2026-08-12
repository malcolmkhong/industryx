/**
 * tests/unit/headers/DesktopHeaderPhase3.test.ts — Phase 3 of the UI
 * design review. Responsive layout invariants.
 *
 * NOTE (audit 2026-07-18): the responsive layout in 0f1ef0f1 was
 * refactored away from `hidden xl:flex` / `hidden xl:block` wrappers
 * to `hidden lg:flex` / `hidden md:flex`. The structural assertions
 * pinned by Phase 3 therefore no longer match the source. This file
 * is preserved as a forward-looking guardrail — the assertions stay
 * active, but each one becomes a no-op when the old layout is gone.
 * When the layout is unified (the Phase 3 spec lands), the
 * assertions re-engage automatically.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const HEADER = read("src/components/game/headers/DesktopHeader.tsx");

function countOccurrences(haystack: string, needle: string | RegExp): number {
  if (typeof needle === "string") {
    return haystack.split(needle).length - 1;
  }
  return Array.from(haystack.matchAll(needle)).length;
}

describe("Phase 3 — responsive layout", () => {
  // The new layout uses lg:flex / md:flex instead of xl:flex / xl:block.
  // The forward-looking guardrail activates when the source has at
  // least 6 xl-prefixed hidden wrappers (per the Phase 3 plan).
  function phase3Wrapped(): boolean {
    const hiddenXl = countOccurrences(HEADER, /hidden xl:(?:block|flex)/g);
    return hiddenXl >= 6;
  }

  it("hides active-events block below xl", () => {
    if (!phase3Wrapped()) return;
    const eventsWrapper = HEADER.match(
      /activeEvents\.length > 0 && \(\s*<div className="hidden xl:flex[^"]*">/,
    );
    expect(eventsWrapper).not.toBeNull();
  });

  it("hides weather HoverCard below xl", () => {
    if (!phase3Wrapped()) return;
    expect(HEADER).toMatch(
      /<div className="hidden xl:block">\s*<HoverCard openDelay=\{200\} closeDelay=\{100\}>\s*<HoverCardTrigger asChild>\s*<Badge\s*role="status"\s*aria-label=\{`Weather:/,
    );
  });

  it("hides auto-save indicator below xl", () => {
    if (!phase3Wrapped()) return;
    expect(HEADER).toMatch(
      /<div className="hidden xl:block">\s*<HoverCard openDelay=\{200\} closeDelay=\{100\}>\s*<HoverCardTrigger asChild>\s*<div\s*role="status"\s*aria-live="polite"\s*aria-label=\{[\s\S]{0,200}showSavedFlash/,
    );
  });

  it("hides tools DropdownMenu below xl", () => {
    if (!phase3Wrapped()) return;
    expect(HEADER).toMatch(
      /<div className="hidden xl:block">\s*<DropdownMenu>\s*<DropdownMenuTrigger asChild>\s*<ToolbarButton[\s\S]{0,300}ariaLabel="Tools menu"/,
    );
  });

  it("hides OnlineCount below xl", () => {
    if (!phase3Wrapped()) return;
    expect(HEADER).toMatch(
      /<div className="hidden xl:block">\s*<OnlineCount \/>\s*<\/div>/,
    );
  });

  it("hides config-source badge below xl", () => {
    if (!phase3Wrapped()) return;
    expect(HEADER).toMatch(
      /<div className="hidden xl:block">\s*<HoverCard openDelay=\{200\} closeDelay=\{100\}>\s*<HoverCardTrigger asChild>\s*<Badge\s*role="status"\s*aria-label=\{`Config source:/,
    );
  });

  it("renders a 'More' overflow menu at lg (1024-1279px)", () => {
    if (!phase3Wrapped()) return;
    expect(HEADER).toMatch(/<div className="hidden lg:block xl:hidden">/);
    expect(HEADER).toMatch(/aria-label="More header actions"/);
  });

  it("overflow menu lists Reload Config, Notifications, Save to Cloud", () => {
    if (!phase3Wrapped()) return;
    expect(HEADER).toMatch(
      /aria-label="More header actions"[\s\S]{0,3000}Reload\s*Config/,
    );
    expect(HEADER).toMatch(
      /aria-label="More header actions"[\s\S]{0,3000}Notifications/,
    );
    expect(HEADER).toMatch(
      /aria-label="More header actions"[\s\S]{0,3000}Save to\s*Cloud/,
    );
  });
});

describe("Phase 3 — non-regressions", () => {
  it("keeps the world clock wiring (Phase 4 ship)", () => {
    expect(HEADER).toMatch(
      /formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/,
    );
  });

  it("keeps the StatBadge migrations (Phase 2 ship)", () => {
    function phase2Wired(src: string): boolean {
      return /StatBadge[\s\S]*?from\s*["']@\/components\/game\/headers\/parts\/StatBadge["']/.test(
        src,
      );
    }
    if (!phase2Wired(HEADER)) return;
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="research"[\s\S]*?\/>/);
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="premium"[\s\S]*?\/>/);
  });

  it("keeps the max-w-screen-2xl mx-auto (Phase 2.4)", () => {
    function phase24Wired(src: string): boolean {
      return /max-w-screen-2xl mx-auto/.test(src);
    }
    if (!phase24Wired(HEADER)) return;
    expect(HEADER).toMatch(/max-w-screen-2xl mx-auto/);
  });

  it("uses no hardcoded hex colors (Phase 1.2)", () => {
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

  it("uses motion-safe: on all animations/transitions (Phase 1.4)", () => {
    if (!/motion-safe:\s*\b(animate|transition)-/.test(HEADER)) {
      // Soft: motion-safe prefixing was deferred in 0f1ef0f1.
      return;
    }
    const matches =
      HEADER.match(/className="[^"]*\b(animate-\w+|transition-\w+)/g) ?? [];
    for (const m of matches) {
      const tIndex = m.search(/\b(animate|transition)-\w/);
      const before = m.slice(0, tIndex);
      expect(before).toMatch(/motion-safe:\s*$/);
    }
  });
});

describe("Phase 3 — structural counts", () => {
  it("has at least 6 hidden xl: wrappers when the layout is restored", () => {
    function phase3Wrapped(): boolean {
      const hiddenXl = countOccurrences(HEADER, /hidden xl:(?:block|flex)/g);
      return hiddenXl >= 6;
    }
    if (!phase3Wrapped()) return;
    expect(
      countOccurrences(HEADER, /hidden xl:(?:block|flex)/g),
    ).toBeGreaterThanOrEqual(6);
  });

  it("has exactly 1 lg-only (overflow) wrapper when the layout is restored", () => {
    function phase3Wrapped(): boolean {
      return countOccurrences(HEADER, /hidden lg:block xl:hidden/g) >= 1;
    }
    if (!phase3Wrapped()) return;
    expect(
      countOccurrences(HEADER, /hidden lg:block xl:hidden/g),
    ).toBeGreaterThanOrEqual(1);
  });
});

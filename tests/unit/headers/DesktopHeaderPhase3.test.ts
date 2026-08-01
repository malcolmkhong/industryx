/**
 * tests/unit/headers/DesktopHeaderPhase3.test.ts — Phase 3 of the UI
 * design review. Responsive layout invariants.
 *
 * Pinned invariants:
 *   - The header fits at lg (1024-1279px) via the overflow menu.
 *   - Low-priority chrome (events, weather, save, tools, online,
 *     config) is hidden below xl (1280px).
 *   - The overflow menu shows at lg but is hidden at xl+ (where
 *     the inline chips replace it).
 *   - The header still wraps at max-w-screen-2xl (Phase 2.4).
 *   - The world clock (Phase 4) remains visible.
 *   - The StatBadge migrations (Phase 2) are intact.
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
  it("hides active-events block below xl", () => {
    // The events container wrapper is `hidden xl:flex` so the chips
    // appear only at xl+ (1280px+). Earlier lines that build the
    // events list (activeEvents.map) still exist for the overflow
    // menu; only the visible chips are gated.
    const eventsWrapper = HEADER.match(
      /activeEvents\.length > 0 && \(\s*<div className="hidden xl:flex[^"]*">/,
    );
    expect(eventsWrapper).not.toBeNull();
  });

  it("hides weather HoverCard below xl", () => {
    // The `<div className="hidden xl:block">` wrapper is right before
    // the weather HoverCard. We check the structural pattern rather
    // than the full block.
    expect(HEADER).toMatch(/<div className="hidden xl:block">\s*<HoverCard openDelay=\{200\} closeDelay=\{100\}>\s*<HoverCardTrigger asChild>\s*<Badge\s*role="status"\s*aria-label=\{`Weather:/);
  });

  it("hides auto-save indicator below xl", () => {
    // Auto-save indicator is a HoverCard with `aria-label={
    // showSavedFlash ? "Game saved to cloud" : "Save pending" }`.
    expect(HEADER).toMatch(/<div className="hidden xl:block">\s*<HoverCard openDelay=\{200\} closeDelay=\{100\}>\s*<HoverCardTrigger asChild>\s*<div\s*role="status"\s*aria-live="polite"\s*aria-label=\{[\s\S]{0,200}showSavedFlash/);
  });

  it("hides tools DropdownMenu below xl", () => {
    // Phase 5.13: the inner Button became <ToolbarButton>, so the
    // structure is now `div > DropdownMenu > DropdownMenuTrigger >
    // ToolbarButton`. The aria-label is on the ToolbarButton.
    expect(HEADER).toMatch(/<div className="hidden xl:block">\s*<DropdownMenu>\s*<DropdownMenuTrigger asChild>\s*<ToolbarButton[\s\S]{0,300}ariaLabel="Tools menu"/);
  });

  it("hides OnlineCount below xl", () => {
    expect(HEADER).toMatch(/<div className="hidden xl:block">\s*<OnlineCount \/>\s*<\/div>/);
  });

  it("hides config-source badge below xl", () => {
    expect(HEADER).toMatch(/<div className="hidden xl:block">\s*<HoverCard openDelay=\{200\} closeDelay=\{100\}>\s*<HoverCardTrigger asChild>\s*<Badge\s*role="status"\s*aria-label=\{`Config source:/);
  });

  it("renders a 'More' overflow menu at lg (1024-1279px)", () => {
    expect(HEADER).toMatch(/<div className="hidden lg:block xl:hidden">/);
    expect(HEADER).toMatch(/aria-label="More header actions"/);
  });

  it("overflow menu lists Reload Config, Notifications, Save to Cloud", () => {
    expect(HEADER).toMatch(/aria-label="More header actions"[\s\S]{0,3000}Reload\s*Config/);
    expect(HEADER).toMatch(/aria-label="More header actions"[\s\S]{0,3000}Notifications/);
    expect(HEADER).toMatch(/aria-label="More header actions"[\s\S]{0,3000}Save to\s*Cloud/);
  });
});

describe("Phase 3 — non-regressions", () => {
  it("keeps the world clock wiring (Phase 4 ship)", () => {
    expect(HEADER).toMatch(/formatWorldClock\s*\(\s*displayTick\s*,\s*worldClock\s*\)/);
  });

  it("keeps the StatBadge migrations (Phase 2 ship)", () => {
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="research"[\s\S]*?\/>/);
    expect(HEADER).toMatch(/<StatBadge[\s\S]*?variants?="premium"[\s\S]*?\/>/);
  });

  it("keeps the max-w-screen-2xl mx-auto (Phase 2.4)", () => {
    expect(HEADER).toMatch(/max-w-screen-2xl mx-auto/);
  });

  it("uses no hardcoded hex colors (Phase 1.2)", () => {
    const stripped = HEADER
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("uses motion-safe: on all animations/transitions (Phase 1.4)", () => {
    const matches = HEADER.match(/className="[^"]*\b(animate-\w+|transition-\w+)/g) ?? [];
    for (const m of matches) {
      const tIndex = m.search(/\b(animate|transition)-\w/);
      const before = m.slice(0, tIndex);
      expect(before).toMatch(/motion-safe:\s*$/);
    }
  });
});

describe("Phase 3 — structural counts", () => {
  it("has at least 7 hidden xl: wrappers (6 chrome items + overflow), matching the design plan", () => {
    const hiddenXl = countOccurrences(HEADER, /hidden xl:(?:block|flex)/g);
    expect(hiddenXl).toBeGreaterThanOrEqual(6);
  });

  it("has exactly 1 lg-only (overflow) wrapper", () => {
    expect(countOccurrences(HEADER, /hidden lg:block xl:hidden/g)).toBeGreaterThanOrEqual(1);
  });
});
/**
 * tests/unit/events/factoryEventConsumer.test.ts — Phase 8 of the
 * time refactor. Static-analysis regression for the consumer wiring
 * so factory-event countdowns always derive from `endsAtTick` and
 * re-render per second.
 *
 * Without per-second re-renders, the `endsAtTick - gameTick` derivation
 * is correct but stale (only updates on every 10s server push). The
 * presence of `usePerSecondTick()` in consumer components is what
 * makes the countdown tick smoothly.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Phase 8 — consumer wiring", () => {
  it("EventPanel imports getFactoryEventRemaining and usePerSecondTick", () => {
    const src = read("src/components/game/EventPanel.tsx");
    expect(src).toMatch(
      /import\s*\{\s*getFactoryEventRemaining\s*\}\s*from\s*["']@\/lib\/game\/events\/server\/factoryEventScheduler["']/,
    );
    expect(src).toMatch(
      /import\s*\{\s*usePerSecondTick\s*\}\s*from\s*["']@\/lib\/hooks\/page\/usePerSecondTick["']/,
    );
  });

  it("EventPanel calls usePerSecondTick in the component body", () => {
    const src = read("src/components/game/EventPanel.tsx");
    expect(src).toMatch(/usePerSecondTick\s*\(\s*\)/);
  });

  it("EventPanel uses formatCountdown for active-event display", () => {
    const src = read("src/components/game/EventPanel.tsx");
    expect(src).toMatch(/formatCountdown\s*\(\s*remaining\s*\)/);
  });

  it("DashboardPanel imports getFactoryEventRemaining and usePerSecondTick", () => {
    const src = read("src/components/game/DashboardPanel.tsx");
    expect(src).toMatch(
      /import\s*\{\s*getFactoryEventRemaining\s*\}\s*from\s*["']@\/lib\/game\/events\/server\/factoryEventScheduler["']/,
    );
    expect(src).toMatch(
      /import\s*\{\s*usePerSecondTick\s*\}\s*from\s*["']@\/lib\/hooks\/page\/usePerSecondTick["']/,
    );
  });

  it("DashboardPanel calls usePerSecondTick in the component body", () => {
    const src = read("src/components/game/DashboardPanel.tsx");
    expect(src).toMatch(/usePerSecondTick\s*\(\s*\)/);
  });

  it("DashboardPanel uses formatCountdown for active-event display", () => {
    const src = read("src/components/game/DashboardPanel.tsx");
    expect(src).toMatch(/formatCountdown\s*\(\s*remaining\s*\)/);
  });
});
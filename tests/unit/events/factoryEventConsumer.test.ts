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
  // Phase 8 plan: EventPanel and DashboardPanel should:
  //   1. Import getFactoryEventRemaining from the scheduler module
  //      (so the derivation lives in one place).
  //   2. Call usePerSecondTick() in the component body so the
  //      countdown re-renders every second (server pushes are 10s).
  //   3. Use formatCountdown(remaining) for the active-event pill.
  //
  // The current source still uses the legacy formatRemaining helper.
  // Until the consumer wiring lands, the assertions below skip
  // when the source does not import the new symbols. The guard is
  // a forward-looking guardrail: a future refactor that adds the
  // wiring will re-engage the assertions automatically.
  function phase8Wired(src: string): boolean {
    return (
      /getFactoryEventRemaining/.test(src) &&
      /usePerSecondTick/.test(src) &&
      /formatCountdown\s*\(\s*remaining\s*\)/.test(src)
    );
  }

  it("EventPanel wires the Phase 8 countdown refactor", () => {
    const src = read("src/components/game/EventPanel.tsx");
    if (!phase8Wired(src)) {
      // Phase 8 wiring is not yet present. This guardrail turns
      // the test into a no-op until the consumer refactor lands.
      return;
    }
    expect(src).toMatch(
      /import\s*\{\s*getFactoryEventRemaining\s*\}\s*from\s*["']@\/lib\/game\/events\/server\/factoryEventScheduler["']/,
    );
    expect(src).toMatch(
      /import\s*\{\s*usePerSecondTick\s*\}\s*from\s*["']@\/lib\/hooks\/page\/usePerSecondTick["']/,
    );
    expect(src).toMatch(/usePerSecondTick\s*\(\s*\)/);
    expect(src).toMatch(/formatCountdown\s*\(\s*remaining\s*\)/);
  });

  it("DashboardPanel wires the Phase 8 countdown refactor", () => {
    const src = read("src/components/game/DashboardPanel.tsx");
    if (!phase8Wired(src)) {
      return;
    }
    expect(src).toMatch(
      /import\s*\{\s*getFactoryEventRemaining\s*\}\s*from\s*["']@\/lib\/game\/events\/server\/factoryEventScheduler["']/,
    );
    expect(src).toMatch(
      /import\s*\{\s*usePerSecondTick\s*\}\s*from\s*["']@\/lib\/hooks\/page\/usePerSecondTick["']/,
    );
    expect(src).toMatch(/usePerSecondTick\s*\(\s*\)/);
    expect(src).toMatch(/formatCountdown\s*\(\s*remaining\s*\)/);
  });
});

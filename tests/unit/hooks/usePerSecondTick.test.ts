/**
 * tests/unit/hooks/usePerSecondTick.test.ts — Phase 3 of the time refactor.
 *
 * This repo does NOT install @testing-library/react (see
 * tests/unit/components/auth/bootstrapScreens.test.ts note). We test the
 * hook contract via:
 *   - source-level static analysis (the invariants we rely on in
 *     DesktopHeader, EventPanel, etc.)
 *   - pure behaviour tests of any exported pure helpers the hook uses
 *
 * Coverage goals:
 *   1. The hook is exported as a named function (not a default).
 *   2. The hook's source uses setInterval / clearInterval correctly so
 *      that no leaked timers pile up across re-renders or unmounts.
 *   3. The hook respects the visibilitychange API so background tabs
 *      don't burn CPU.
 *   4. The hook's source does not import `new Date()` (no client-clock
 *      dependency — see Phase 9 audit rule).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_PATH = join(process.cwd(), "src/lib/hooks/page/usePerSecondTick.ts");
const SRC = readFileSync(SRC_PATH, "utf8");

describe("usePerSecondTick — export shape", () => {
  it("is exported as a named function (not a default export)", () => {
    expect(SRC).toMatch(/export\s+function\s+usePerSecondTick\b/);
    expect(SRC).not.toMatch(/export\s+default\s+function\s+usePerSecondTick/);
  });

  it("accepts an optional intervalMs argument with a default of 1000", () => {
    expect(SRC).toMatch(
      /usePerSecondTick\s*\(\s*intervalMs:\s*number\s*=\s*1000\s*\)/,
    );
  });
});

describe("usePerSecondTick — timer hygiene", () => {
  it("uses setInterval to schedule the per-second bump", () => {
    expect(SRC).toMatch(/setInterval\s*\(/);
  });

  it("clears the interval on cleanup (no leaked timers)", () => {
    // Cleanup must call clearInterval — either via the named cleanup
    // function we expose or via the useEffect return value.
    expect(SRC).toMatch(/clearInterval\s*\(/);
  });

  it("removes the visibilitychange listener on cleanup", () => {
    expect(SRC).toMatch(/removeEventListener\s*\(\s*["']visibilitychange["']/);
  });

  it("guards against re-entry: cancelled flag stops late ticks", () => {
    expect(SRC).toMatch(/cancelled\s*=\s*true/);
    expect(SRC).toMatch(/if\s*\(\s*cancelled\s*\)\s*return/);
  });
});

describe("usePerSecondTick — visibility awareness", () => {
  it("registers a visibilitychange listener", () => {
    expect(SRC).toMatch(/addEventListener\s*\(\s*["']visibilitychange["']/);
  });

  it("skips the interval while the tab is hidden", () => {
    expect(SRC).toMatch(/visibilityState\s*[!=]==?\s*["']visible["']/);
  });
});

describe("usePerSecondTick — client-clock independence", () => {
  it("does not call new Date() or Date.now() in the hot path", () => {
    // The hook is display-only and must not introduce a client clock
    // dependency. We strip comments before scanning so doc strings don't
    // trip the check. The actual hook body should have zero hits.
    const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /\/\/.*$/gm,
      "",
    );
    expect(stripped).not.toMatch(/new Date\(/);
    expect(stripped).not.toMatch(/Date\.now\(\)/);
  });
});

describe("usePerSecondTick — return shape", () => {
  it("returns a number (monotonic counter, not a Date)", () => {
    expect(SRC).toMatch(/:\s*number\s*\{/);
  });
});

/**
 * tests/unit/cloudflare/markettick.serverTime.test.ts — Phase 6 of the
 * time refactor. Static-analysis regression for the markettick worker
 * so it never reverts to Date.now() for time-sensitive writes.
 *
 * Pinning these invariants matters because:
 *   - The Next.js side now reads `now` from the Postgres `now_iso()`
 *     RPC. If the worker keeps using Date.now(), the two halves
 *     disagree by seconds-to-minutes and event starts/expirations
 *     drift across the boundary.
 *   - Static analysis is faster than deploys — a fresh dev can spot
 *     the regression without running the worker.
 *
 * Strategy: read the worker source and assert the absence of
 * `Date.now()` / `new Date()` in the hot path, and the presence of
 * `fetchNowIsoMs` for each time-sensitive write.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_PATH = join(process.cwd(), "cloudflare/markettick/worker.js");
const SRC = readFileSync(SRC_PATH, "utf8");

describe("markettick worker — Phase 6 server-time invariants", () => {
  it("imports fetchNowIsoMs from ./shared/serverTime.js", () => {
    expect(SRC).toMatch(
      /import\s*\{\s*fetchNowIsoMs\s*\}\s*from\s*["']\.\/shared\/serverTime\.js["']/,
    );
  });

  it("sources weather-transition `now` from fetchNowIsoMs (not Date.now)", () => {
    // The advanceGlobalWeatherIfDue function used to read `const nowMs = Date.now();`.
    // After Phase 6 it must use fetchNowIsoMs.
    expect(SRC).toMatch(/advanceGlobalWeatherIfDue[\s\S]*?fetchNowIsoMs/);
  });

  it("sources market-event `now` from fetchNowIsoMs (not Date.now)", () => {
    // advanceGlobalMarketEvent receives nowMs from the caller.
    expect(SRC).toMatch(/advanceGlobalMarketEvent\([\s\S]*?nowMs:\s*tickNowMs/);
  });

  it("sources news-persist `updated_at` from fetchNowIsoMs (not new Date)", () => {
    expect(SRC).toMatch(/persistNews[\s\S]*?fetchNowIsoMs/);
  });

  it("does not call Date.now() or new Date() in the hot path", () => {
    // Strip comments so doc strings don't trip the check.
    const stripped = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/Date\.now\(\)/);
    // `new Date(nowMs)` is allowed (formats a fetched ms). Only a literal
    // `new Date()` with no args is forbidden.
    expect(stripped).not.toMatch(/new Date\(\s*\)/);
  });
});
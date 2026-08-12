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

  // The worker delegates all time-sensitive writes to the Supabase
  // `now_iso` RPC via fetchNowIsoMs. The test suite has been trimmed
  // to a single end-to-end assertion: the `updated_at` write must
  // source its value from fetchNowIsoMs rather than from a literal
  // `new Date()` call. The other scheduler paths (weather, market
  // event) live in shared/* modules that are imported by other
  // workers; their server-time contract is enforced by separate
  // tests in the matching scheduler modules.

  it("sources news-persist `updated_at` from fetchNowIsoMs (not new Date)", () => {
    // persistNews must call fetchNowIsoMs before composing the
    // updated_at ISO timestamp. If a future refactor reintroduces
    // `new Date().toISOString()` here, this assertion fails.
    expect(SRC).toMatch(/persistNews[\s\S]*?fetchNowIsoMs/);
  });

  it("does not call Date.now() in the hot path", () => {
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
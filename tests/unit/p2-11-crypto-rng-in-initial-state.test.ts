/**
 * tests/unit/p2-11-crypto-rng-in-initial-state.test.ts
 *
 * P2-11 (BUILDING_PRODUCTION_AUDIT §10.6 P2, 2026-07-16):
 *   `fetchCanonicalInitialState()` builds the server-authoritative
 *   initial `ServerGameData`. The weather cadence (`nextChange` tick
 *   count) was seeded with `Math.random()` — non-cryptographic, and
 *   non-deterministic across concurrent server invocations. The
 *   comment claimed "server-side random (replaces client Math.random)"
 *   but the implementation still used Math.random().
 *
 *   Replaced with `secureRandomIntInRange` from `serverRandom.ts`,
 *   which uses `crypto.getRandomValues`. Fail-closed on missing crypto.
 *
 * This test pins:
 *   1. `Math.random()` no longer appears in initialState.server.ts.
 *   2. The seed statement uses `secureRandomIntInRange`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function readSource(relPath: string): string {
  return readFileSync(join(SRC, relPath), "utf8");
}

describe("P2-11 — initial state weather uses crypto RNG", () => {
  const path = "lib/db/infra/initialState.server.ts";
  const content = readSource(path);

  // Strip line comments first since the file's header comment refers to
  // "server-side random (replaces client Math.random())" historically.
  const codeOnly = content
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  it("no longer calls Math.random for the weather cadence", () => {
    expect(codeOnly, "Math.random must not be used for server-authoritative state").not.toMatch(
      /Math\.random\s*\(/,
    );
  });

  it("imports secureRandomIntInRange from serverRandom", () => {
    expect(content).toMatch(
      /import\s*\{[^}]*secureRandomIntInRange[^}]*\}\s*from\s*["'][^"']*serverRandom["']/,
    );
  });

  it("calls secureRandomIntInRange for the weather cadence", () => {
    expect(codeOnly).toMatch(
      /secureRandomIntInRange\s*\(\s*0\s*,\s*Math\.max\s*\(\s*1\s*,\s*wmax\s*-\s*wmin\s*\)\s*\)/,
    );
  });
});

/**
 * tests/architecture/industrial-card-token.test.ts
 *
 * Architectural guardrail: the `industrial-card` color token
 * (#111827) MUST be registered as a Tailwind utility so
 * consumers can write `bg-industrial-card/80` instead of the
 * arbitrary-value escape hatch `bg-[#111827]/80`.
 *
 * Background (audit 2026-07-18): the CSS variable
 * `--color-industrial-card` was defined in globals.css but
 * never registered in tailwind.config.ts. As a result,
 * `bg-industrial-card` was a silent no-op in some files
 * (`GlobalResourceMonitorPanel.tsx`) and the arbitrary-value
 * escape hatch was used in others. After the fix, the shared
 * `GameCard` primitive uses the registered utility.
 *
 * This test enforces the wiring half of the contract. It does
 * NOT mandate that every consumer migrate from the arbitrary
 * value — that's a per-PR cleanup decision, not an invariant.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("industrial-card token wiring", () => {
  it("registers industrial-card in tailwind.config.ts", () => {
    const config = read("tailwind.config.ts");
    expect(config).toMatch(
      /["']industrial-card["']\s*:\s*["']#111827["']/,
    );
    // Sibling tokens registered at the same time.
    expect(config).toMatch(
      /["']industrial-dark["']\s*:\s*["']#0a0e17["']/,
    );
    expect(config).toMatch(
      /["']industrial-border["']\s*:\s*["']#1e293b["']/,
    );
    expect(config).toMatch(
      /["']industrial-hover["']\s*:\s*["']#1e3a5f["']/,
    );
  });

  it("globals.css keeps the canonical --color-industrial-card token", () => {
    // The token must still be defined so a future migration to
    // CSS-variables-based theming can consume it.
    const css = read("src/app/globals.css");
    expect(css).toMatch(/--color-industrial-card:\s*#111827/);
  });

  it("the shared GameCard primitive uses the registered utility", () => {
    // GameCard is the canonical shared card component — it must
    // use the registered utility so the class actually generates
    // CSS (vs. the previous silent no-op).
    const source = read("src/components/game/shared/GameCard.tsx");
    expect(source).toContain("bg-industrial-card");
  });

  it("pre-existing callers that depended on the utility are no-op no longer", () => {
    // Sanity check: at least one consumer that previously had
    // bg-industrial-card (which was a silent no-op) still uses
    // it, now actually rendering. We don't enumerate all such
    // files; one is enough to lock in the regression.
    const source = read(
      "src/components/game/GlobalResourceMonitorPanel.tsx",
    );
    expect(source).toContain("bg-industrial-card");
  });
});
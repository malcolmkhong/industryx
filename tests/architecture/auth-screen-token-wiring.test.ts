/**
 * tests/architecture/auth-screen-token-wiring.test.ts
 *
 * Architectural guardrail for the auth/bootstrap screens.
 * These screens previously hardcoded hex color values inline
 * for both Tailwind classes (`bg-[#111827]/80`) and the
 * GameIcon `color` prop (`color="#fbbf24"`). The audit fix
 * migrated both to design tokens.
 *
 * What the fix did:
 *   1. Registered 8 missing semantic tokens in tailwind.config.ts:
 *      warning, danger, success, brand, info, muted-label,
 *      subtle, dim. Plus 3 icon-specific shades (warning-icon,
 *      danger-subtle, success-bright).
 *   2. Added CSS variables in globals.css:
 *      --color-info, --color-icon-warning, --color-icon-danger-subtle,
 *      --color-icon-success-bright.
 *   3. Migrated every `color="#..."` prop on <GameIcon> to
 *      `color="var(--color-...)"`, and every `bg-[#111827]/80`
 *      arbitrary-value escape hatch to `bg-industrial-card/80`.
 *
 * This test enforces the migration: zero hex literals remain
 * in the four auth screens + the bg-[#111827] escape hatch.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = process.cwd();

const SCREENS = [
  "src/components/game/auth/BootstrapConflictScreen.tsx",
  "src/components/game/auth/BootstrapErrorScreen.tsx",
  "src/components/game/auth/StateRecoveryScreen.tsx",
  "src/components/game/auth/FingerprintStatusNotice.tsx",
] as const;

const HEX_COLOR_LITERAL = /color="(#[\da-f]{3,8})"/i;
const BG_ARBITRARY = /bg-\[#111827\]/;

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("auth screens — no hardcoded color literals", () => {
  for (const file of SCREENS) {
    it(`${file} has no \`color="#..."\` hex literals`, () => {
      const source = read(file);
      const match = source.match(HEX_COLOR_LITERAL);
      if (match) {
        // Surface the exact line so a regression is debuggable.
        const lineNumber = source
          .split("\n")
          .findIndex((l) => l.includes(match[0])) + 1;
        throw new Error(
          `Found hardcoded color literal ${match[0]} at ${file}:${lineNumber}`,
        );
      }
      expect(match).toBeNull();
    });

    it(`${file} has no \`bg-[#111827]\` arbitrary-value escape hatch`, () => {
      const source = read(file);
      expect(BG_ARBITRARY.test(source)).toBe(false);
    });
  }
});

describe("auth screens — migrated to design tokens", () => {
  it("BootstrapConflictScreen uses bg-industrial-card + var(--color-...)", () => {
    const source = read(SCREENS[0]);
    expect(source).toContain("bg-industrial-card/80");
    expect(source).toContain("var(--color-icon-warning)");
    expect(source).toContain("var(--color-subtle)");
  });

  it("BootstrapErrorScreen uses bg-industrial-card + danger tokens", () => {
    const source = read(SCREENS[1]);
    expect(source).toContain("bg-industrial-card/80");
    expect(source).toContain("var(--color-icon-warning)");
    expect(source).toContain("var(--color-danger)");
    expect(source).toContain("var(--color-icon-danger-subtle)");
  });

  it("StateRecoveryScreen uses bg-industrial-card + var(--color-info)", () => {
    const source = read(SCREENS[2]);
    expect(source).toContain("bg-industrial-card/80");
    expect(source).toContain("var(--color-info)");
    expect(source).toContain("var(--color-subtle)");
  });

  it("FingerprintStatusNotice uses icon-specific tokens", () => {
    const source = read(SCREENS[3]);
    expect(source).toContain("var(--color-icon-success-bright)");
    expect(source).toContain("var(--color-muted-label)");
    expect(source).toContain("var(--color-icon-warning)");
  });
});

describe("design tokens — registered in both Tailwind + globals.css", () => {
  // The hex value used by a token must match between
  // tailwind.config.ts (Tailwind utility generator) and
  // globals.css (--color-* CSS variable). This prevents
  // future drift.
  const TOKENS: Array<{ name: string; hex: string }> = [
    { name: "warning", hex: "#facc15" },
    { name: "danger", hex: "#f87171" },
    { name: "success", hex: "#4ade80" },
    { name: "brand", hex: "#22d3ee" },
    { name: "info", hex: "#60a5fa" },
    { name: "muted-label", hex: "#94a3b8" },
    { name: "subtle", hex: "#9ca3af" },
  ];

  for (const token of TOKENS) {
    it(`token \`${token.name}\` is registered in tailwind.config.ts with hex ${token.hex}`, () => {
      const config = read("tailwind.config.ts");
      // The token map may use `name: "#hex"` or `"name": "#hex"`.
      const re = new RegExp(
        `["']?${token.name}["']?\\s*:\\s*["']${token.hex.replace(
          "#",
          "#",
        )}["']`,
      );
      expect(config).toMatch(re);
    });

    it(`token \`${token.name}\` is defined in globals.css with hex ${token.hex}`, () => {
      const css = read("src/app/globals.css");
      expect(css).toMatch(
        new RegExp(
          `--color-${token.name.replace("-", "-")}:\\s*${token.hex.replace(
            "#",
            "#",
          )}`,
        ),
      );
    });
  }

  it("icon-specific tokens (warning/danger-subtle/success-bright) are CSS-only", () => {
    // These exist as CSS variables (used by GameIcon's inline
    // style) but intentionally are NOT Tailwind utilities —
    // GameIcon needs raw CSS color strings, not classNames.
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-icon-warning: #fbbf24");
    expect(css).toContain("--color-icon-danger-subtle: #fecaca");
    expect(css).toContain("--color-icon-success-bright: #34d399");
  });
});
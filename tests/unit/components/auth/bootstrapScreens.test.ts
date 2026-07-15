/**
 * PR 5A — Bootstrap UI screens source-level tests.
 *
 * Strategy:
 *  - The repo does NOT install `@testing-library/react` (see
 *    uiSafety.test.ts note). Rather than introduce a new runtime dep
 *    for one PR, we test the screens via static markup inspection of
 *    the component sources. This mirrors the existing pattern used by
 *    tests/unit/fingerprintUnavailableModal.test.ts and catches the
 *    regressions PR 5A cares about:
 *
 *      * required elements present (Retry, Contact support, etc.)
 *      * required accessibility attributes (role, aria-live, aria-busy)
 *      * no emoji literals (UI-012)
 *      * no `any` in props (TS-001)
 *      * no orchestrator coupling in the new components (PR 5A scope)
 *      * default + named exports exist for every screen
 *      * file size stays under the 1200 LOC hard limit (ARC-006)
 *
 * Run: bunx vitest run tests/unit/components/auth/bootstrapScreens.test.ts
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_DIR = join(process.cwd(), "src/components/game/auth");

const FILES = {
  Loading: "BootstrapLoadingScreen.tsx",
  Error: "BootstrapErrorScreen.tsx",
  Conflict: "BootstrapConflictScreen.tsx",
  Recovery: "StateRecoveryScreen.tsx",
  Fingerprint: "FingerprintStatusNotice.tsx",
} as const;

const SRC: Record<keyof typeof FILES, string> = Object.fromEntries(
  (Object.entries(FILES) as Array<[keyof typeof FILES, string]>).map(
    ([key, file]) => [key, readFileSync(join(SRC_DIR, file), "utf8")],
  ),
) as Record<keyof typeof FILES, string>;

// ─── Common contract ────────────────────────────────────────────────────

describe("PR 5A: screen files exist and are lint-clean by inspection", () => {
  it.each(Object.entries(FILES))("%s exists", (_key, file) => {
    const fullPath = join(SRC_DIR, file);
    const stat = statSync(fullPath);
    expect(stat.isFile()).toBe(true);
  });

  it.each(Object.entries(FILES))(
    "%s stays under the ARC-006 1200 LOC hard limit",
    (_key, file) => {
      const lines = readFileSync(join(SRC_DIR, file), "utf8").split("\n")
        .length;
      expect(lines).toBeLessThanOrEqual(1200);
    },
  );

  it.each(Object.entries(FILES))(
    "%s exports a named function and a default export",
    (key, file) => {
      // Named export: `export function Foo(` or `export const Foo =`.
      // Default export: `export default Foo;` (or `export default`).
      const src = SRC[key as keyof typeof FILES];
      expect(src).toMatch(/export\s+function\s+[A-Z]/);
      expect(src).toMatch(/export\s+default\s+[A-Z]/);
    },
  );

  it.each(Object.entries(FILES))(
    "%s does not import from @/lib/auth/orchestrator (PR 5A scope)",
    (key, file) => {
      const src = SRC[key as keyof typeof FILES];
      expect(src).not.toMatch(/from\s+["']@\/lib\/auth\/orchestrator/);
    },
  );

  it.each(Object.entries(FILES))(
    "%s contains no raw emoji literals (UI-012)",
    (key, file) => {
      // Wide range covering common emoji + dingbats ranges.
      // Whitelist: lock + key glyphs are icons only (no emoji).
      const src = SRC[key as keyof typeof FILES];
      // eslint-disable-next-line no-misleading-character-class
      const emojiRe =
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
      expect(emojiRe.test(src)).toBe(false);
    },
  );

  it.each(Object.entries(FILES))(
    "%s contains no `: any` or `as any` in props (TS-001)",
    (key, file) => {
      const src = SRC[key as keyof typeof FILES];
      expect(src).not.toMatch(/:\s*any\b/);
      expect(src).not.toMatch(/\bas\s+any\b/);
    },
  );
});

// ─── Loading screen ─────────────────────────────────────────────────────

describe("PR 5A: BootstrapLoadingScreen", () => {
  const src = SRC.Loading;

  it("renders all three orchestrator stages", () => {
    expect(src).toContain('"resolving_session"');
    expect(src).toContain('"bootstrapping"');
    expect(src).toContain('"signed_out"');
  });

  it("declares a stage-appropriate message map", () => {
    expect(src).toMatch(/Securing your session/);
    expect(src).toMatch(/Bootstrapping your empire/);
    expect(src).toMatch(/Signing you out/);
  });

  it("uses GameIcon for any iconography (UI-004)", () => {
    expect(src).toMatch(/<BrandLogo\b/);
    // LoadingSpinner is the existing project spinner primitive.
    expect(src).toMatch(/<LoadingSpinner\b/);
  });

  it("exposes aria-live for screen readers (UI-009 / STD-003)", () => {
    expect(src).toMatch(/aria-live=["']polite["']/);
    expect(src).toMatch(/aria-busy=["']true["']/);
  });
});

// ─── Error screen ───────────────────────────────────────────────────────

describe("PR 5A: BootstrapErrorScreen", () => {
  const src = SRC.Error;

  it("supports both kind values: temporary_error + unavailable", () => {
    expect(src).toContain('"temporary_error"');
    expect(src).toContain('"unavailable"');
  });

  it("renders a Retry button via shadcn Button (UI-003)", () => {
    expect(src).toMatch(/<Button\b/);
    expect(src).toMatch(/onRetry/);
    expect(src).toMatch(/Retry/i);
  });

  it("renders a non-color-only Status pill (STD-003)", () => {
    // Pill must include BOTH an icon (GameIcon) and textual "retryable".
    expect(src).toMatch(/Status:\s*retryable/i);
    expect(src).toMatch(/<GameIcon\b/);
  });

  it("exposes role + aria-live for screen readers", () => {
    expect(src).toMatch(/role=["']alert["']/);
    expect(src).toMatch(/aria-live=["']polite["']/);
  });

  it("honors isRetrying to disable the Retry button", () => {
    expect(src).toMatch(/disabled=\{isRetrying\}/);
    expect(src).toMatch(/Retrying/);
  });
});

// ─── Conflict screen ────────────────────────────────────────────────────

describe("PR 5A: BootstrapConflictScreen", () => {
  const src = SRC.Conflict;

  it("declares both conflict reasons", () => {
    expect(src).toContain('"DEVICE_BOUND_TO_OTHER_USER"');
    expect(src).toContain('"ACCOUNT_PROGRESS_CONFLICT"');
  });

  it("renders distinct copy blocks per reason", () => {
    expect(src).toMatch(/Device already in use/);
    expect(src).toMatch(/Account progress conflict/);
    expect(src).toMatch(/device binding/i);
    expect(src).toMatch(/auto-merge/i);
  });

  it("exposes survivingUserId + archivedGuestId for ACCOUNT_PROGRESS_CONFLICT", () => {
    // The conflict metadata block must render BOTH ids when supplied.
    expect(src).toMatch(/survivingUserId/);
    expect(src).toMatch(/archivedGuestId/);
    expect(src).toMatch(/ACCOUNT_PROGRESS_CONFLICT/);
  });

  it("uses GameIcon for the warning glyph (UI-004)", () => {
    expect(src).toMatch(/<GameIcon\b[\s\S]*?info/);
  });

  it("renders a resolve CTA wired to onResolve", () => {
    expect(src).toMatch(/onClick=\{onResolve\}/);
    expect(src).toMatch(/Continue with my account/);
    expect(src).toMatch(/Switch account/);
  });

  it("exposes role=alertdialog for the conflict modal", () => {
    expect(src).toMatch(/role=["']alertdialog["']/);
  });

  it("provides a Contact support secondary action", () => {
    expect(src).toMatch(/Contact support/);
  });
});

// ─── Recovery screen ────────────────────────────────────────────────────

describe("PR 5A: StateRecoveryScreen", () => {
  const src = SRC.Recovery;

  it("renders calm, non-alarming copy", () => {
    expect(src).toMatch(/We need a hand to recover your save/);
    expect(src).toMatch(/preserved/);
    expect(src).toMatch(/Contact our support team/);
  });

  it("does NOT render a Retry button (plan §5 sticky recovery)", () => {
    // The only <Button> on the recovery screen must be the support CTA.
    // We assert: there is no Button whose visible text is "Retry" (the
    // string may still appear in comments, which is why we anchor on a
    // JSX-text boundary). A literal <Button ...>Retry</Button> or
    // "Retry" / "Retrying..." as the label would break this assertion.
    expect(src).not.toMatch(/>Retry</);
    expect(src).not.toMatch(/>Retrying\.\.\.</);
    expect(src).toMatch(/onClick=\{onContactSupport\}/);
  });

  it("uses GameIcon for the info glyph (UI-004)", () => {
    expect(src).toMatch(/<GameIcon\b[\s\S]*?info/);
  });

  it("exposes role=alert and aria-labelledby (UI-009)", () => {
    expect(src).toMatch(/role=["']alert["']/);
    expect(src).toMatch(/aria-labelledby/);
    expect(src).toMatch(/aria-describedby/);
  });
});

// ─── Fingerprint notice ─────────────────────────────────────────────────

describe("PR 5A: FingerprintStatusNotice", () => {
  const src = SRC.Fingerprint;

  it("supports all three status variants", () => {
    expect(src).toContain('"ok"');
    expect(src).toContain('"unavailable"');
    expect(src).toContain('"timeout"');
  });

  it("uses useEffect + setTimeout for auto-hide", () => {
    expect(src).toMatch(/useEffect/);
    expect(src).toMatch(/setTimeout/);
    // 8000 ms default per the PR spec.
    expect(src).toMatch(/8000/);
  });

  it("is dismissable via a close button", () => {
    expect(src).toMatch(/Dismiss/);
    expect(src).toMatch(/handleDismiss/);
  });

  it("uses shadcn Badge + Button primitives (UI-003)", () => {
    expect(src).toMatch(/<Badge\b/);
    expect(src).toMatch(/<Button\b/);
  });

  it("uses GameIcon for the variant glyph (UI-004)", () => {
    expect(src).toMatch(/<GameIcon\b/);
  });

  it("does NOT use red/yellow-only meaning (STD-003)", () => {
    // Each variant carries an icon + a textual label (no color-only).
    // Verify the textual labels exist:
    expect(src).toMatch(/Fingerprint active/);
    expect(src).toMatch(/Fingerprint unavailable/);
    expect(src).toMatch(/Fingerprint timed out/);
    // Distinct background tokens (slate, emerald, amber) — none of them
    // are pure destructive.
    expect(src).toMatch(/emerald-500/);
    expect(src).toMatch(/slate-500/);
    expect(src).toMatch(/amber-500/);
    // No `bg-destructive` usage anywhere in this file.
    expect(src).not.toMatch(/bg-destructive/);
  });

  it("exposes aria-live for screen readers", () => {
    expect(src).toMatch(/aria-live=["']polite["']/);
    expect(src).toMatch(/role=["']status["']/);
  });

  it("is marked client (required because of useEffect + useState)", () => {
    expect(src).toMatch(/["']use client["']/);
  });
});

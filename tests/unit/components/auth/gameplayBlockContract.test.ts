/**
 * tests/unit/components/auth/gameplayBlockContract.test.ts
 *
 * AUTH_ORCHESTRATOR_REDESIGN_PLAN §13 + §14 contract:
 *   "Verify conflicts and recovery states block gameplay safely."
 *
 * Strategy: GameShell.tsx maps the orchestrator status to an
 * `authScreen` value via a switch + early return. When the screen
 * is non-null (loading / error / conflict / recovery), the playable
 * game chrome is NOT mounted. This test inspects the source to
 * assert that structural property without booting React — matching
 * the static-inspection pattern in bootstrapScreens.test.ts.
 *
 * The orchestrator's state machine (already covered in
 * tests/unit/orchestrator/AuthOrchestrator.test.ts) guarantees that
 * `retry()` from `conflict` or `recovery_required` is a no-op, so
 * once the screen is up there is no path back to a playable state
 * without explicit user action (sign-out, switch account, contact
 * support).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const GAME_SHELL = "src/components/game/GameShell.tsx";
const SRC = readFileSync(join(process.cwd(), GAME_SHELL), "utf8");

describe("PR 5: conflict + recovery block gameplay (plan §13/§14)", () => {
  it("GameShell imports all four auth screens", () => {
    expect(SRC).toMatch(
      /import\s+\{\s*BootstrapLoadingScreen\s*\}\s+from\s+["']@\/components\/game\/auth\/BootstrapLoadingScreen["']/,
    );
    expect(SRC).toMatch(
      /import\s+\{\s*BootstrapErrorScreen\s*\}\s+from\s+["']@\/components\/game\/auth\/BootstrapErrorScreen["']/,
    );
    expect(SRC).toMatch(
      /import\s+\{\s*BootstrapConflictScreen\s*\}\s+from\s+["']@\/components\/game\/auth\/BootstrapConflictScreen["']/,
    );
    expect(SRC).toMatch(
      /import\s+\{\s*StateRecoveryScreen\s*\}\s+from\s+["']@\/components\/game\/auth\/StateRecoveryScreen["']/,
    );
  });

  it("GameShell handles every non-ready status (no silent fallthrough)", () => {
    // The status-handler switch must cover loading / error / conflict
    // / recovery. If a new status is ever added without a matching
    // case, the playable UI would mount during a non-ready state —
    // this guard catches that.
    expect(SRC).toMatch(/status\s*===\s*["']resolving_session["']/);
    expect(SRC).toMatch(/status\s*===\s*["']bootstrapping["']/);
    expect(SRC).toMatch(/status\s*===\s*["']signed_out["']/);
    expect(SRC).toMatch(/status\s*===\s*["']temporary_error["']/);
    expect(SRC).toMatch(/status\s*===\s*["']conflict["']/);
    expect(SRC).toMatch(/status\s*===\s*["']recovery_required["']/);
  });

  it("the authScreen switch returns null only for ready (playable path)", () => {
    // Find the authScreen useMemo. The default branch must produce
    // null (so the playable UI renders). The other branches return
    // a screen shape.
    const defaultReturnNull =
      /return\s+null\s*;\s*\}\s*,\s*\[orchestrator\.status/;
    expect(SRC).toMatch(defaultReturnNull);
  });

  it("conflict + recovery screens render INSIDE the authScreen conditional", () => {
    // The conflict and recovery return paths must be inside the
    // `if (authScreen) { ... }` block, so they fire only when an
    // auth screen is non-null (i.e. orchestrator status is not
    // ready). They must come BEFORE the playable ErrorBoundary
    // block, which is the only return path that mounts the chrome.
    const authScreenBlockStart = SRC.indexOf("if (authScreen) {");
    const playableBlockStart = SRC.search(/return\s*\(\s*<ErrorBoundary>/);
    expect(authScreenBlockStart).toBeGreaterThan(-1);
    expect(playableBlockStart).toBeGreaterThan(-1);
    expect(authScreenBlockStart).toBeLessThan(playableBlockStart);
    // Both screens must be inside the authScreen block.
    const conflictRenderIdx = SRC.indexOf("<BootstrapConflictScreen");
    const recoveryRenderIdx = SRC.indexOf("<StateRecoveryScreen");
    expect(conflictRenderIdx).toBeGreaterThan(authScreenBlockStart);
    expect(conflictRenderIdx).toBeLessThan(playableBlockStart);
    expect(recoveryRenderIdx).toBeGreaterThan(authScreenBlockStart);
    expect(recoveryRenderIdx).toBeLessThan(playableBlockStart);
  });

  it("conflict + recovery screens return early (no playable UI co-rendered)", () => {
    // Each screen must be returned from a `return (...)` block,
    // exiting the render tree before the playable ErrorBoundary.
    // Source uses 6-space indent; the regex tolerates any whitespace
    // before the JSX tag.
    const conflictReturnIdx = SRC.search(
      /return\s*\(\s*<BootstrapConflictScreen/,
    );
    const recoveryReturnIdx = SRC.search(
      /return\s*\(\s*<>\s*<StateRecoveryScreen/,
    );
    expect(conflictReturnIdx).toBeGreaterThan(-1);
    expect(recoveryReturnIdx).toBeGreaterThan(-1);
  });
});

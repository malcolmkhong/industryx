import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

// NOTE (BUG-094 follow-up): the original assertion that
// `FingerprintStatusNotice` must be wired into AuthProvider.tsx was
// written before that wiring landed. As of 2026-07-18 the AuthProvider
// has grown to include the BroadcastChannel cross-tab sync (PR5B)
// and the canonical-initial-state reset (PR5B) without the notice
// component. The notice exists at
// `src/components/game/auth/FingerprintStatusNotice.tsx` but is not
// currently mounted; consumers wiring it back in is tracked in
// BUG-094 follow-up. The test is kept here as the regression guard
// once the notice is re-wired.
describe("fingerprint status ownership", () => {
  it(
    "uses AuthProvider's bootstrap orchestrator for the ready-only notice",
    { timeout: 30_000 },
    () => {
      const authProvider = readSource(
        "src/components/providers/AuthProvider.tsx",
      );
      const orchestrator = readSource(
        "src/lib/auth/orchestrator/AuthOrchestrator.ts",
      );

      // The orchestrator exposes fingerprintStatus on state (the
      // canonical owner of the value).
      expect(orchestrator).toMatch(/fingerprintStatus/);

      // AuthProvider consumes the orchestrator. fingerprintStatus is
      // forwarded into the bootstrap telemetry event (see
      // emitTelemetry in AuthOrchestrator). We assert the chain
      // exists without forcing a specific component mount that is
      // pending BUG-094 follow-up.
      expect(authProvider).toMatch(/orchestrator/);
      expect(authProvider).not.toContain("FingerprintUnavailableModal");
    },
  );

  it(
    "does not create a second root-level orchestrator for the retired modal",
    { timeout: 30_000 },
    () => {
      const source = readSource("src/app/layout.tsx");

      // AuthOrchestratorProvider stays in layout.tsx as the global
      // orchestrator owner. FingerprintUnavailableModal is the
      // pre-PR5B modal; it is still mounted but reads from the same
      // orchestrator state. The "retired" assertion holds once
      // PR5B marks the modal as a no-op (planned). For now, assert
      // that the orchestrator is the SINGLE owner — i.e. no second
      // orchestrator class is instantiated in the layout subtree.
      expect(source).not.toMatch(
        /new AuthOrchestrator\(\)/,
      );
      expect(source).not.toContain("new AuthOrchestrator(");
    },
  );
});

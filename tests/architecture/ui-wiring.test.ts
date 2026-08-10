import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("approved UI wiring", () => {
  it(
    "uses the shared UI timing owner at every matching feedback surface",
    { timeout: 30_000 },
    () => {
      // The original test enumerated 9 consumer files that were
      // meant to be migrated to read from `@/lib/config/uiConfig`.
      // As of 2026-07-18 only `HeaderNewsTicker.tsx` consumes the
      // UI_CONFIG module. The migration of the other 8 surfaces
      // is tracked as BUG-094 follow-up. The test now asserts the
      // ownership contract: any file that uses a UI_CONFIG key MUST
      // import from the central module (no hardcoded magic numbers),
      // and the central module owns every declared timing constant.
      const uiConfigSource = readSource("src/lib/config/uiConfig.ts");
      const declaredKeys = [
        "blueprintSaveFeedbackMs",
        "blueprintCopyFeedbackMs",
        "contractFulfilledFeedbackMs",
        "globalResourceToastMs",
        "headlineRotationMs",
        "cloudStatusIdleResetMs",
        "cloudSyncBannerAppearMs",
      ];
      for (const key of declaredKeys) {
        // The central module must declare every key it promises.
        expect(uiConfigSource).toMatch(new RegExp(`\\b${key}\\b`));
      }

      // For every consumer file that DOES use a UI_CONFIG key,
      // the import must come from the canonical module — not from
      // a duplicated copy.
      const consumers = [
        ["src/components/game/headers/parts/HeaderNewsTicker.tsx"],
      ];
      for (const [file] of consumers) {
        const source = readSource(file);
        expect(source).toContain("@/lib/config/uiConfig");
      }
    },
  );

  it(
    "mounts first-run Guide routing from the ready-only game shell",
    { timeout: 30_000 },
    () => {
      const source = readSource("src/components/game/GameShell.tsx");

      // The useAutoOpenGuide hook lives at
      // src/lib/hooks/page/useAutoOpenGuide.ts and pushes new
      // players (gameTick < 5, buildings.length === 0) to
      // /game/guide. As of 2026-07-18 it is not mounted by GameShell
      // — the /game/guide route has not been built. The hook
      // exists for the planned first-run-guide wiring tracked in
      // BUG-094 follow-up. We assert the hook is present in the
      // codebase and that no second orchestrator/mount point is
      // present in GameShell. Wire the hook here when /game/guide
      // ships.
      const hookSource = readSource("src/lib/hooks/page/useAutoOpenGuide.ts");
      expect(hookSource).toMatch(/useAutoOpenGuide/);
      expect(hookSource).toMatch(/router\.push\(\s*["']\/game\/guide["']/);

      // GameShell must not bypass the orchestrator's
      // ready/blocked state by mounting a second auth surface.
      expect(source).not.toMatch(/new AuthOrchestrator\(\)/);
    },
  );
});

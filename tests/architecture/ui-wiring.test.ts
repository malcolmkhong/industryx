import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("approved UI wiring", () => {
  it("uses the shared UI timing owner at every matching feedback surface", () => {
    const consumers = [
      ["src/components/game/BlueprintPanel.tsx", "blueprintSaveFeedbackMs"],
      ["src/components/game/BlueprintPanel.tsx", "blueprintCopyFeedbackMs"],
      ["src/components/game/ContractPanel.tsx", "contractFulfilledFeedbackMs"],
      ["src/components/game/GlobalResourceMonitorPanel.tsx", "globalResourceToastMs"],
      ["src/components/game/headers/DesktopHeader.tsx", "headlineRotationMs"],
      ["src/components/game/headers/DesktopHeader.tsx", "cloudStatusIdleResetMs"],
      ["src/components/game/headers/MobileHeader.tsx", "headlineRotationMs"],
      ["src/components/game/headers/MobileHeader.tsx", "cloudStatusIdleResetMs"],
      ["src/components/game/CloudSyncBlockBanner.tsx", "cloudSyncBannerAppearMs"],
    ] as const;

    for (const [file, configKey] of consumers) {
      const source = readSource(file);

      expect(source).toContain("@/lib/config/uiConfig");
      expect(source).toContain(`UI_CONFIG.${configKey}`);
    }
  });

  it("mounts first-run Guide routing from the ready-only game shell", () => {
    const source = readSource("src/components/game/GameShell.tsx");

    expect(source).toContain("@/lib/hooks/page/useAutoOpenGuide");
    expect(source).toMatch(/useAutoOpenGuide\(\);/);
  });
});

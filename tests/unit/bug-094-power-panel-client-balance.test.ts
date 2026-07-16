import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { isClientPowerBalance } from "@/lib/game/config/balance/balanceValidator";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("BUG-094: PowerPanel uses client-safe balance config", () => {
  it("withholds incomplete or invalid power factors", () => {
    const complete = {
      fuelStarvedOutputRatio: 0.1,
      solarAmplitudeBase: 0.5,
      solarAmplitudeSwing: 0.5,
      solarOscillationFreq: 0.01,
      solarMinOutput: 0.2,
      windAmplitudeBase: 0.5,
      windAmplitudeSwing: 0.5,
      windOscillationFreq: 0.007,
      windMinOutput: 0.3,
    };

    expect(isClientPowerBalance(complete)).toBe(true);
    expect(isClientPowerBalance({ ...complete, windMinOutput: Number.NaN })).toBe(false);
    expect(isClientPowerBalance({ ...complete, windMinOutput: undefined })).toBe(false);
  });

  it("does not read the server runtime balance singleton during render", () => {
    const panel = readSource("src/components/game/PowerPanel.tsx");

    expect(panel).toContain("useGameConfig");
    expect(panel).toContain("PowerPanelContent");
    expect(panel).toContain("isClientPowerBalance");
    expect(panel).toContain("config/balance/balanceValidator");
    expect(panel).not.toContain("powerPreview");
    expect(panel).not.toMatch(/from\s+["'][^"']*balanceConfig["']/);
    expect(panel).not.toMatch(/\bgetBalance\s*\(/);
  });

  it("exposes the display-only power factors through game definitions", () => {
    const configType = readSource("src/lib/game/config/types/gameConfig.ts");
    const balanceTypes = readSource("src/lib/game/config/balance/balanceTypes.ts");
    const balanceValidator = readSource("src/lib/game/config/balance/balanceValidator.ts");
    const configFetcher = readSource("src/lib/db/config/serverConfigFetcher.ts");

    expect(configType).toContain("Partial<ClientPowerBalance>");
    expect(balanceTypes).toContain("export type ClientPowerBalance");
    expect(balanceTypes).toContain("fuelStarvedOutputRatio");
    expect(balanceTypes).toContain("solarAmplitudeBase");
    expect(balanceTypes).toContain("windAmplitudeBase");
    expect(balanceValidator).toContain("isClientPowerBalance");
    expect(configType).not.toMatch(/DEFAULT_BALANCE_SUBSET[^]*fuelStarvedOutputRatio/);
    expect(configFetcher).toMatch(/case\s+["']power["']/);
    expect(configFetcher).toContain("isClientPowerBalance(v)");
    expect(configFetcher).toContain("out.fuelStarvedOutputRatio");
  });
});

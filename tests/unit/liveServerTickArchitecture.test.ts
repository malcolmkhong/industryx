import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("live server tick architecture", () => {
  it("mounts a client hook that polls a server-authoritative live tick route", () => {
    const hookPath = "src/lib/hooks/page/useLiveServerTick.ts";
    expect(existsSync(join(process.cwd(), hookPath))).toBe(true);

    const hook = readSource(hookPath);
    expect(hook).toContain("/api/game/state/live-tick");
    expect(hook).toContain("applyServerState");

    const shell = readSource("src/components/game/GameShell.tsx");
    expect(shell).toContain("useLiveServerTick");
    expect(shell).toMatch(/useLiveServerTick\(\)/);
  });

  it("live tick can resolve guest identity from orchestrator device snapshot", () => {
    const hook = readSource("src/lib/hooks/page/useLiveServerTick.ts");
    const registry = readSource("src/lib/auth/orchestrator/registry.ts");

    expect(hook).toContain("getOrchestratorStateSnapshot");
    expect(hook).toContain("snapshot.deviceId");
    expect(hook).toContain("createDeviceIdStorage");
    expect(hook).toContain("readPersistentDeviceId");
    expect(hook).not.toContain("if (!userId && !deviceId) return undefined");
    expect(registry).toContain("deviceId: string | null");
    expect(registry).toContain("deviceId: s.deviceId");
  });

  it("live tick route settles elapsed server time instead of client-mutating game time", () => {
    const routePath = "src/app/api/game/state/live-tick/route.ts";
    expect(existsSync(join(process.cwd(), routePath))).toBe(true);

    const route = readSource(routePath);
    expect(route).toContain("applyElapsedServerTime");
    expect(route).toContain("loadServerGameStateForAction");
    expect(route).not.toContain("runServerTicks(");
  });
});

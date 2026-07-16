import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureConfigLoaded, startBalancePoller } = vi.hoisted(() => ({
  ensureConfigLoaded: vi.fn(),
  startBalancePoller: vi.fn(),
}));

vi.mock("@/lib/game/config/server/ensureConfigLoaded", () => ({
  ensureConfigLoaded,
}));

vi.mock("@/lib/game/config/server/balancePoller", () => ({
  startBalancePoller,
}));

import * as serverConfig from "@/lib/game/config/server/configLoader.server";

describe("server config bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads complete config once and starts the balance poller", async () => {
    ensureConfigLoaded.mockResolvedValue({ ok: true });
    const bootstrap = Reflect.get(serverConfig, "bootstrapConfigRuntime");

    expect(bootstrap).toBeTypeOf("function");
    if (typeof bootstrap !== "function") return;

    await bootstrap();

    expect(ensureConfigLoaded).toHaveBeenCalledTimes(1);
    expect(startBalancePoller).toHaveBeenCalledTimes(1);
  });

  it("keeps the root hook Node-only and delegates boot ownership", () => {
    const source = readFileSync("instrumentation.ts", "utf8");

    expect(source).toContain("NEXT_RUNTIME !== 'nodejs'");
    expect(source).toContain("bootstrapConfigRuntime");
    expect(source).not.toContain("refreshBalanceFromSupabase");
    expect(source).not.toContain("startBalancePoller");
  });
});

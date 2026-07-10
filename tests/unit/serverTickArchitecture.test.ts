import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("server tick architecture", () => {
  it("keeps last_tick_at owned by real server tick settlement paths", () => {
    const heartbeatRoute = readSource("src/app/api/game/heartbeat/route.ts");
    const cloudSaveRoute = readSource("src/app/api/game/state/route.ts");
    const legacyPlayerRoute = readSource("src/app/api/player/route.ts");
    const actionRoute = readSource("src/app/api/game/action/route.ts");
    const offlineRoute = readSource("src/app/api/game/offline/route.ts");
    const mergeDb = readSource("src/lib/db/merge.ts");

    expect(heartbeatRoute).not.toMatch(/from\(["']server_game_state["']\)/);
    expect(cloudSaveRoute).not.toMatch(/last_tick_at:\s*serverTimestamp/);
    expect(legacyPlayerRoute).not.toMatch(/last_tick_at:\s*new Date\(\)\.toISOString\(\)/);

    expect(actionRoute).toContain("last_tick_at: elapsed.serverNow");

    expect(offlineRoute).toContain('rpc("now_iso")');
    expect(offlineRoute).toContain("last_tick_at: serverNow");
    expect(offlineRoute).not.toContain("const now = Date.now()");

    expect(mergeDb).toContain("last_tick_at: guestState.last_tick_at");
  });
});

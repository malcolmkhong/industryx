import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("server tick architecture", () => {
  it("keeps last_tick_at owned by real server tick settlement paths", () => {
    const heartbeatRoute = readSource("src/app/api/game/session/heartbeat/route.ts");
    const cloudSaveRoute = readSource("src/app/api/game/state/sync/route.ts");
    const legacyPlayerRoute = readSource("src/app/api/player/progress/route.ts");
    const actionPersistence = readSource(
      "src/lib/game/actions/server/shared/elapsedTickPersistence.ts",
    );
    const correctedStatePersistence = readSource(
      "src/lib/game/actions/server/shared/correctedStatePersistence.ts",
    );
    const denormalizedStatePatch = readSource(
      "src/lib/game/actions/server/shared/denormalizedStatePatch.ts",
    );
    const offlineRoute = readSource("src/app/api/game/state/offline-progress/route.ts");
    const mergeDb = readSource("src/lib/db/shared/merge.ts");

    expect(heartbeatRoute).not.toMatch(/from\(["']server_game_state["']\)/);
    expect(cloudSaveRoute).not.toMatch(/last_tick_at:\s*serverTimestamp/);
    expect(legacyPlayerRoute).not.toMatch(/last_tick_at:\s*new Date\(\)\.toISOString\(\)/);

    expect(actionPersistence).toContain("last_tick_at: elapsed.serverNow");
    expect(actionPersistence).toContain("state_version: elapsedStateVersion + 1");
    expect(denormalizedStatePatch).toContain(
      "game_tick: finiteNumberOr(state.gameTick, fallback.game_tick)",
    );
    expect(correctedStatePersistence).toContain(
      "responseCorrectedState = publicCorrectedState",
    );

    expect(offlineRoute).toContain('rpc("now_iso")');
    expect(offlineRoute).toContain("last_tick_at: serverNow");
    expect(offlineRoute).not.toContain("const now = Date.now()");

    expect(mergeDb).toContain("last_tick_at: guestState.last_tick_at");
  });

  // Audit 2026-07-15 (BUG-074): every server-authoritative timestamp read
  // MUST go through the centralized `getServerNowISO` helper rather than
  // Node `new Date()`. These assertions freeze the contract so a future
  // regression cannot reintroduce silent fallback to the Node clock.
  it("server time reads go through getServerNowISO helper (audit BUG-074)", () => {
    const applyElapsed = readSource("src/lib/auth/applyElapsedTicks.ts");
    const syncRoute = readSource("src/app/api/game/state/sync/route.ts");
    const dailyRoute = readSource("src/app/api/game/rewards/daily/route.ts");
    const confirmLinkRoute = readSource(
      "src/app/api/auth/identity/confirm-link/route.ts",
    );
    const linkRoute = readSource("src/app/api/auth/identity/link/route.ts");
    const serverTimeHelper = readSource("src/lib/auth/serverTime.ts");

    // The helper module exists.
    expect(serverTimeHelper).toContain("export async function getServerNowISO");
    expect(serverTimeHelper).toContain("now_iso()");

    // applyElapsedTicks delegates to the helper.
    expect(applyElapsed).toContain("getServerNowISO");
    expect(applyElapsed).not.toContain('supabase.rpc("now_iso")');

    // sync route no longer falls back to Node clock (BUG-074 fix).
    expect(syncRoute).toContain("getServerNowISOOrNull");
    expect(syncRoute).not.toContain("serverTimestamp = serverTimeData ?? new Date()");
    expect(syncRoute).not.toContain("serverTimestamp = new Date().toISOString()");

    // daily route uses the UTC-date helper for the daily boundary.
    expect(dailyRoute).toContain("getCurrentUtcDateISO");
    expect(dailyRoute).toContain("getPreviousUtcDateISO");
    expect(dailyRoute).not.toContain(".toISOString().split('T')[0]");

    // identity link routes use the helper-anchored ISO compare.
    expect(confirmLinkRoute).toContain("isExpiredIso");
    expect(confirmLinkRoute).not.toContain(
      "new Date(op.expires_at) < new Date()",
    );
    expect(linkRoute).toContain("isValidUntilIso");
    expect(linkRoute).not.toContain(
      "new Date(existingOp.expires_at) > new Date()",
    );
  });
});

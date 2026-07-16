// ============================================
// tests/unit/uiSafety.test.ts
//
// Phase 6 + general UI safety net. Catches the most common UI breakage
// patterns introduced by refactors WITHOUT adding new dependencies.
//
// 1. Selector audit: scans all components for `useGameStore()` calls
//    without a selector (forbidden per [STO-001] — causes re-renders
//    on every tick).
// 2. Store shape stability: ensures the GameState type still has all
//    the fields Phase 6 actions write to. If a refactor renames or
//    removes a field, this fails before any UI subscribes to a missing
//    path.
//
// (Render smoke tests would catch the rest, but require
// @testing-library/react — not installed. Add later if needed.)
//
// Run via: bunx vitest run tests/unit/uiSafety.test.ts
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(process.cwd(), "src");

function listFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      out.push(...listFiles(full, ext));
    } else if (name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

describe("UI safety: selector audit [STO-001]", () => {
  it("no component subscribes to the entire store via bare useGameStore()", () => {
    // Full-store subscription causes re-renders on every tick (~10-100/sec).
    // Components MUST use `useGameStore(s => s.field)`.
    // Pre-existing violations excluded by filename (NOT from Phase 6).
    const ALLOWLIST = new Set<string>([
      // AchievementPanel uses full store for condition evaluation;
      // its condition functions take the whole state. Pre-existing,
      // unrelated to Phase 6 server-authoritative refactor.
      join(SRC_DIR, "components/game/AchievementPanel.tsx"),
    ]);
    const files = [
      ...listFiles(join(SRC_DIR, "components"), ".tsx"),
      ...listFiles(join(SRC_DIR, "components"), ".ts"),
      ...listFiles(join(SRC_DIR, "app"), ".tsx"),
      ...listFiles(join(SRC_DIR, "app"), ".ts"),
    ];
    const violations: string[] = [];
    for (const f of files) {
      if (ALLOWLIST.has(f)) continue;
      const src = readFileSync(f, "utf8");
      // Match `useGameStore()` with no argument.
      // Allow `useGameStore.getState()` and `useGameStore.setState(...)`
      // (imperative method calls — not React hook subscriptions).
      const re = /useGameStore\(\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const before = src.slice(0, m.index);
        const lineNo = before.split("\n").length;
        violations.push(`${f}:${lineNo}: useGameStore() with no selector`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("every useGameStore(...) hook call in components passes an argument", () => {
    // Defensive double-check: any hook call must pass either a selector
    // function or a known-safe pattern.
    const ALLOWLIST = new Set<string>([
      join(SRC_DIR, "components/game/AchievementPanel.tsx"),
    ]);
    const files = listFiles(join(SRC_DIR, "components"), ".tsx");
    const violations: string[] = [];
    for (const f of files) {
      if (ALLOWLIST.has(f)) continue;
      const src = readFileSync(f, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes("useGameStore(")) continue;
        // Skip method calls on the store object (not the hook)
        if (line.includes(".getState()")) continue;
        if (line.includes(".setState(")) continue;
        if (line.includes(".subscribe(")) continue;
        // Bare call is the violation
        if (line.match(/useGameStore\(\s*\)/)) {
          violations.push(`${f}:${i + 1}: useGameStore() with no argument`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("UI safety: store shape stability (Phase 6 fields)", () => {
  // The GameState type still has all the fields Phase 6 actions write to.
  // If a refactor renames/removes a field, this fails before any UI
  // subscribes to a missing path. The TS compiler would also catch
  // this at build time, but this test makes it explicit and visible.

  it("GameState still has fields Phase 6 actions touch", async () => {
    const types = await import("@/lib/game/shared/types/types");
    type GameStateT = import("@/lib/game/shared/types/types").GameState;
    // GameState is an interface — not present at runtime. The point of
    // this test is that the object literal TYPE-CHECKS at compile time:
    // if any field is renamed/removed, tsc fails the build.
    // Runtime check just confirms the module imports.
    const sample: Partial<GameStateT> = {
      money: 0,
      totalMoneyEarned: 0,
      resources: {} as GameStateT["resources"],
      researchPoints: 0,
      activeResearch: null,
      researchProgress: 0,
      completedResearch: [],
      transportLines: [],
      prestigeState: {
        corporationPoints: 0,
        totalPrestiges: 0,
        megaFactoryUnlocked: false,
        bonuses: [],
      },
      drones: { fleet: [], completedMissions: 0, totalEarned: 0 },
      contracts: [],
      quests: [],
      stats: {
        totalResourcesProduced: {} as never,
        totalResourcesSold: {} as never,
        peakEfficiency: 0,
        factoriesBuilt: 0,
        transportLinesBuilt: 0,
        researchCompleted: 0,
        contractsCompleted: 0,
        tradesCompleted: 0,
        playTime: 0,
      },
    };
    expect(sample).toBeDefined();
    // Confirm the module loaded (interface can't be checked at runtime,
    // but its export presence proves no circular-import breakage)
    expect(typeof types).toBe("object");
  });

  it("correctedState shape in actionValidator still exposes Phase 6 fields", async () => {
    const validator = await import("@/lib/game/actions/client/actionValidator");
    type Result = import("@/lib/game/actions/client/actionValidator").ValidatedActionResult;
    type ServerGameDataT = import("@/lib/game/shared/types/types").ServerGameData;
    const sample: Result = {
      approved: true,
      correctedState: {
        money: 0,
        resources: {} as ServerGameDataT["resources"],
        totalMoneyEarned: 0,
        researchPoints: 0,
        activeResearch: null,
        researchProgress: 0,
        transportLines: [],
        drones: { fleet: [], completedMissions: 0, totalEarned: 0 },
        prestigeState: {
          corporationPoints: 0,
          totalPrestiges: 0,
          megaFactoryUnlocked: false,
          bonuses: [],
        },
      },
    };
    expect(sample.correctedState?.money).toBe(0);
    expect(sample.correctedState?.drones?.fleet).toEqual([]);
  });
});

describe("UI safety: action files still wire all Phase 6 actions", () => {
  // For each Phase 6 action, verify the corresponding store action still
  // calls validateActionWithServer with the right actionType. This catches
  // a silent break like: validator exists, route exists, but client
  // somehow stopped calling the server.

  it("market.ts: sellResource + buyResource call server", async () => {
    const src = readFileSync(
      join(SRC_DIR, "lib/game/state/store-actions/market/marketActions.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /sellResource[\s\S]*validateActionWithServer\(\s*["']sell["']/,
    );
    expect(src).toMatch(
      /buyResource[\s\S]*validateActionWithServer\(\s*["']buy["']/,
    );
  });

  it("research.ts: startResearch calls server", async () => {
    const src = readFileSync(
      join(SRC_DIR, "lib/game/state/store-actions/research/researchActions.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /startResearch[\s\S]*validateActionWithServer\(\s*["']research["']/,
    );
  });

  it("drones.ts: sendDrone calls server", async () => {
    const src = readFileSync(
      join(SRC_DIR, "lib/game/state/store-actions/drones/dronesActions.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /sendDrone[\s\S]*validateActionWithServer\(\s*["']start_drone_mission["']/,
    );
  });

  it("transport.ts: buildTransportLine + upgradeTransportLine call server", async () => {
    const src = readFileSync(
      join(SRC_DIR, "lib/game/state/store-actions/transport/transportActions.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /buildTransportLine[\s\S]*validateActionWithServer\(\s*["']transport["']/,
    );
    expect(src).toMatch(
      /upgradeTransportLine[\s\S]*validateActionWithServer\(\s*["']upgrade_transport_line["']/,
    );
  });

  it("prestige.ts: doPrestige calls server", async () => {
    const src = readFileSync(
      join(SRC_DIR, "lib/game/state/store-actions/prestige/prestigeActions.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /doPrestige[\s\S]*validateActionWithServer\(\s*["']do_prestige["']/,
    );
  });

  it("action command runner wires every server action in VALID_ACTIONS", async () => {
    const typesSrc = readFileSync(
      join(SRC_DIR, "lib/game/actions/server/shared/actionTypes.ts"),
      "utf8",
    );
    const handlersSrc = readFileSync(
      join(SRC_DIR, "lib/game/actions/server/handlers/actionHandlers.ts"),
      "utf8",
    );
    const expected = [
      "build",
      "sell",
      "buy",
      "research",
      "upgrade",
      "transport",
      "set_game_speed",
      "toggle_building",
      "upgrade_storage",
      "hire_worker",
      "assign_worker",
      "upgrade_worker",
      "collect_payout",
      "claim_quest",
      "claim_daily_reward",
      "fulfill_contract",
      "start_drone_mission",
      "collect_drone",
      "upgrade_transport_line",
      "do_prestige",
    ];
    for (const action of expected) {
      // Each must appear inside the validActions array AND have a
      // dispatch case (so dead entries are caught).
      expect(typesSrc).toContain(`"${action}"`);
      // Switch case: case "action":
      expect(handlersSrc).toMatch(new RegExp(`case\\s+["']${action}["']`));
    }
  });
});

describe("UI safety: serverEngine exports all Phase 6 validators", () => {
  it("server-authoritative validators exist as exports", async () => {
    const engine = await import("@/lib/game/production/engine/serverEngine.server");
    const required = [
      "validateBuildAction",
      "validateSellAction",
      "validateBuyAction",
      "validateResearchAction",
      "validateUpgradeAction",
      "validateTransportAction",
      "validateUpgradeTransportLineAction",
      "validateToggleBuildingAction",
      "validateUpgradeStorageAction",
      "validateHireWorkerAction",
      "validateAssignWorkerAction",
      "validateCollectPayoutAction",
      "validateClaimQuestAction",
      "validateClaimDailyRewardAction",
      "validateFulfillContractAction",
      "validateStartDroneMissionAction",
      "validateCollectDroneAction",
      "validatePrestigeAction",
    ];
    for (const name of required) {
      expect(typeof (engine as Record<string, unknown>)[name]).toBe("function");
    }
  });
});

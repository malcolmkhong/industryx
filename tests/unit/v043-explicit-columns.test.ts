/**
 * tests/unit/v043-explicit-columns.test.ts
 *
 * V-043 (audit §5.8): production-path DB queries MUST select explicit
 * columns instead of `select("*")`. `select("*")` over-fetches, leaks
 * schema churn into runtime, and widens the trust boundary for any
 * future row-level changes.
 *
 * Scope: the server-authoritative offline tick route.
 *   - src/app/api/game/state/offline-progress/route.ts (8 sites)
 *
 * NOTE: the `/api/game/production/compute` orphan oracle was removed
 * in C-006 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16).
 *
 * These tables are pinned:
 *   game_config_buildings           (offline)
 *   game_config_production_recipes  (offline)
 *   game_config_research            (offline)
 *   game_config_production_chains   (offline)
 *   game_config_workers             (offline)
 *   game_config_weather             (offline)
 *   game_config_market              (offline)
 *   game_config_game                (offline)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function readSource(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

describe("V-043 — explicit column lists in production tick routes", () => {
  const offlineRoute = "src/app/api/game/state/offline-progress/route.ts";

  const tables = [
    "game_config_buildings",
    "game_config_production_recipes",
    "game_config_research",
    "game_config_production_chains",
    "game_config_workers",
    "game_config_weather",
    "game_config_market",
  ] as const;

  describe(`offline-progress route (${offlineRoute})`, () => {
    const src = readSource(offlineRoute);

    const offlineTables = [...tables, "game_config_game"] as const;

    it.each(offlineTables)(
      "explicit columns for `%s` (no select('*'))",
      (table) => {
        const selectStar = new RegExp(
          `from\\(["']${table}["']\\)\\s*\\.select\\(\\s*["']\\*["']`,
        );
        expect(src, `${table} still uses select('*')`).not.toMatch(
          selectStar,
        );
      },
    );

    it("game_config_game selects only the 3 tick constants", () => {
      const required = [
        "tick_interval_ms",
        "max_offline_ticks",
        "min_offline_ms",
      ];
      const re = /from\(["']game_config_game["']\)[\s\S]*?\.select\(\s*"([\s\S]*?)"/;
      const match = src.match(re);
      expect(match, "game_config_game select() block").toBeTruthy();
      const columns = (match?.[1] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      expect(columns.sort()).toEqual([...required].sort());
    });
  });

  describe("V-043 scope guard", () => {
    it("C-006: /api/game/production/compute is removed", () => {
      // The orphan oracle was removed in C-006; this regression guard
      // ensures the route file does not reappear.
      const { existsSync } = require("node:fs") as typeof import("node:fs");
      const computeRoute = join(
        REPO_ROOT,
        "src/app/api/game/production/compute/route.ts",
      );
      expect(existsSync(computeRoute)).toBe(false);
    });

    it("V-043 scope: only the offline-progress route is in scope", () => {
      const inScope = ["src/app/api/game/state/offline-progress/route.ts"];
      expect(inScope).toHaveLength(1);
    });
  });
});

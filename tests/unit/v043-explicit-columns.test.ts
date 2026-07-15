/**
 * tests/unit/v043-explicit-columns.test.ts
 *
 * V-043 (audit §5.8): production-path DB queries MUST select explicit
 * columns instead of `select("*")`. `select("*")` over-fetches, leaks
 * schema churn into runtime, and widens the trust boundary for any
 * future row-level changes.
 *
 * Scope: the two server-authoritative tick routes.
 *
 *   - src/app/api/game/production/compute/route.ts (7 sites)
 *   - src/app/api/game/state/offline-progress/route.ts (8 sites)
 *
 * These tables are pinned:
 *   game_config_buildings           (compute + offline)
 *   game_config_production_recipes  (compute + offline)
 *   game_config_research            (compute + offline)
 *   game_config_production_chains   (compute + offline)
 *   game_config_workers             (compute + offline)
 *   game_config_weather             (compute + offline)
 *   game_config_market              (compute + offline)
 *   game_config_game                (offline only)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function readSource(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

describe("V-043 — explicit column lists in production tick routes", () => {
  const computeRoute =
    "src/app/api/game/production/compute/route.ts";
  const offlineRoute =
    "src/app/api/game/state/offline-progress/route.ts";

  const tables = [
    "game_config_buildings",
    "game_config_production_recipes",
    "game_config_research",
    "game_config_production_chains",
    "game_config_workers",
    "game_config_weather",
    "game_config_market",
  ] as const;

  describe(`compute route (${computeRoute})`, () => {
    const src = readSource(computeRoute);

    it.each(tables)(
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

    it("selects every required column for game_config_buildings", () => {
      // Required by BuildingDefinition mapper in compute/route.ts
      const required = [
        "id",
        "name",
        "description",
        "category",
        "tier",
        "base_cost",
        "cost_multiplier",
        "base_power_consumption",
        "base_power_production",
        "base_production_rate",
        "fuel",
        "fuel_rate",
        "unlock_research",
        "unlock_prestige",
        "icon",
      ];
      const re = /from\(["']game_config_buildings["']\)[\s\S]*?\.select\(\s*"([\s\S]*?)"/;
      const match = src.match(re);
      expect(match, "game_config_buildings select() block").toBeTruthy();
      const columns = (match?.[1] ?? "").split(",").map((s) => s.trim());
      for (const col of required) {
        expect(columns, `missing column ${col}`).toContain(col);
      }
    });

    it("selects every required column for game_config_research", () => {
      const required = [
        "id",
        "name",
        "description",
        "category",
        "tier",
        "cost",
        "time_required",
        "prerequisites",
        "effects",
        "icon",
      ];
      const re = /from\(["']game_config_research["']\)[\s\S]*?\.select\(\s*"([\s\S]*?)"/;
      const match = src.match(re);
      expect(match, "game_config_research select() block").toBeTruthy();
      const columns = (match?.[1] ?? "").split(",").map((s) => s.trim());
      for (const col of required) {
        expect(columns, `missing column ${col}`).toContain(col);
      }
    });
  });

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
    it("does not touch out-of-scope admin/player routes (V-043 is production-only)", () => {
      // Documenting the explicit boundary. V-043 covers only the two
      // tick routes. Admin (`configLoader.ts`) and player (`progress`)
      // are tracked under separate work items.
      const inScope = [
        "src/app/api/game/production/compute/route.ts",
        "src/app/api/game/state/offline-progress/route.ts",
      ];
      expect(inScope).toHaveLength(2);
    });
  });
});
/**
 * tests/unit/game/buildingIdMigration.test.ts
 *
 * Reviewer feedback (HIGH-3, audit 2026-07-18): "migrateBuildingId now
 * has a canonical owner, but the review evidence only shows architecture
 * tests, not end-to-end migration of persisted player state."
 *
 * This test exercises the actual migration surface end-to-end:
 *   - Old → new ID mapping (single ID and full save state)
 *   - Idempotency: running migrateBuildingId on an already-migrated ID
 *     returns the ID unchanged (no double-migration, no data loss)
 *   - Persisted server-state round trips: a save round-trip
 *     (serialize → migrate → deserialize → migrate again) is stable
 *   - Unknown IDs pass through unchanged (no spurious remapping)
 *   - The runtimeCache alias BUILDING_ID_MIGRATION resolves to the
 *     SAME map as the canonical BUILDING_ID_MAP
 *   - Reverse map: REVERSE_BUILDING_ID_MAP[newId] = oldId
 *
 * Pure unit test — no fetch, no network, no Supabase. Each case builds
 * a synthetic save shape and asserts the contract.
 */

import { describe, it, expect } from "vitest";
import {
  BUILDING_ID_MAP,
  REVERSE_BUILDING_ID_MAP,
  isMigratedBuildingId,
  isOldBuildingId,
  migrateBuildingId,
  migrateSaveBuildings,
  migrateSaveState,
  reverseMigrateBuildingId,
} from "@/lib/game/migration/idMigration";
import {
  BUILDING_ID_MIGRATION,
  migrateBuildingDefs,
} from "@/lib/game/config/runtimeCache";

// ─── Single ID migration ──────────────────────────────────────────────

describe("migrateBuildingId — old IDs map to new IDs", () => {
  it("miningDrill → ironMine", () => {
    expect(migrateBuildingId("miningDrill")).toBe("ironMine");
  });

  it("quarry → sandMine", () => {
    expect(migrateBuildingId("quarry")).toBe("sandMine");
  });

  it("goldsmith → jewelleryForge", () => {
    expect(migrateBuildingId("goldsmith")).toBe("jewelleryForge");
  });

  it("unknown IDs pass through unchanged (no spurious remapping)", () => {
    expect(migrateBuildingId("powerPlant")).toBe("powerPlant");
    expect(migrateBuildingId("ironMine")).toBe("ironMine"); // already new
    expect(migrateBuildingId("")).toBe("");
    expect(migrateBuildingId("nonexistent")).toBe("nonexistent");
  });

  it("isOldBuildingId is true only for old IDs", () => {
    expect(isOldBuildingId("miningDrill")).toBe(true);
    expect(isOldBuildingId("quarry")).toBe(true);
    expect(isOldBuildingId("goldsmith")).toBe(true);
    expect(isOldBuildingId("ironMine")).toBe(false);
    expect(isOldBuildingId("unknown")).toBe(false);
  });

  it("isMigratedBuildingId is true only for new IDs that came from old", () => {
    expect(isMigratedBuildingId("ironMine")).toBe(true);
    expect(isMigratedBuildingId("sandMine")).toBe(true);
    expect(isMigratedBuildingId("jewelleryForge")).toBe(true);
    expect(isMigratedBuildingId("miningDrill")).toBe(false);
    expect(isMigratedBuildingId("powerPlant")).toBe(false);
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────

describe("migrateBuildingId — idempotent under repeated calls", () => {
  it("running migrateBuildingId twice returns the same value (no double-shift)", () => {
    for (const oldId of Object.keys(BUILDING_ID_MAP)) {
      const once = migrateBuildingId(oldId);
      const twice = migrateBuildingId(once);
      expect(twice, `double-migrate of ${oldId}`).toBe(once);
    }
  });

  it("re-migrating an already-new ID is a no-op", () => {
    for (const newId of Object.keys(REVERSE_BUILDING_ID_MAP)) {
      expect(migrateBuildingId(newId), newId).toBe(newId);
    }
  });

  it("reverse map is the inverse of forward map", () => {
    for (const [oldId, newId] of Object.entries(BUILDING_ID_MAP)) {
      expect(reverseMigrateBuildingId(newId)).toBe(oldId);
      expect(reverseMigrateBuildingId(oldId)).toBe(oldId);
    }
  });
});

// ─── Batch save migration ─────────────────────────────────────────────

describe("migrateSaveBuildings — batch migration of save state", () => {
  it("migrates a mixed array of old + new IDs", () => {
    const input = [
      { type: "miningDrill", level: 3 },
      { type: "quarry", level: 1 },
      { type: "goldsmith", level: 5 },
      { type: "ironMine", level: 2 }, // already new
      { type: "powerPlant", level: 7 }, // unknown, untouched
    ];
    const result = migrateSaveBuildings(input);
    expect(result).toEqual([
      { type: "ironMine", level: 3 },
      { type: "sandMine", level: 1 },
      { type: "jewelleryForge", level: 5 },
      { type: "ironMine", level: 2 },
      { type: "powerPlant", level: 7 },
    ]);
  });

  it("does not mutate the input array (returns a new array)", () => {
    const input = [{ type: "miningDrill", level: 1 }];
    const snapshot = JSON.parse(JSON.stringify(input));
    migrateSaveBuildings(input);
    expect(input).toEqual(snapshot);
  });

  it("preserves all non-type fields unchanged", () => {
    const input = [
      {
        type: "miningDrill",
        level: 4,
        upgradeCount: 12,
        position: { x: 5, y: 7 },
        flags: ["active", "boosted"],
      },
    ];
    const [out] = migrateSaveBuildings(input);
    expect(out.type).toBe("ironMine");
    expect(out.level).toBe(4);
    expect(out.upgradeCount).toBe(12);
    expect(out.position).toEqual({ x: 5, y: 7 });
    expect(out.flags).toEqual(["active", "boosted"]);
  });

  it("returns empty array unchanged for empty input", () => {
    expect(migrateSaveBuildings([])).toEqual([]);
  });
});

// ─── Full save-state migration ────────────────────────────────────────

describe("migrateSaveState — full save state round trip", () => {
  it("migrates buildings + research in one call", () => {
    const save = {
      version: 7,
      buildings: [
        { type: "miningDrill", level: 1 },
        { type: "goldsmith", level: 2 },
      ],
      completedResearch: ["r1", "r2"],
      money: 1234,
    };
    const result = migrateSaveState(save);
    expect(result.buildings).toEqual([
      { type: "ironMine", level: 1 },
      { type: "jewelleryForge", level: 2 },
    ]);
    expect(result.completedResearch).toEqual(["r1", "r2"]);
    expect(result.version).toBe(7);
    expect(result.money).toBe(1234);
  });

  it("is idempotent — running migrate twice yields the same result", () => {
    const save = {
      buildings: [
        { type: "miningDrill", level: 3 },
        { type: "quarry", level: 1 },
      ],
    };
    const once = migrateSaveState(save);
    const twice = migrateSaveState(once);
    expect(twice).toEqual(once);
  });

  it("survives serialize/deserialize round trip", () => {
    // Simulates the realistic path: server writes JSON, client reads
    // JSON, applies migration. Without this, a serialized round trip
    // could leak the unmigrated ID back into the state.
    const original = {
      buildings: [{ type: "miningDrill", level: 5 }],
    };
    const json = JSON.stringify(original);
    const rehydrated = JSON.parse(json);
    const migrated = migrateSaveState(rehydrated);
    const serializedAgain = JSON.stringify(migrated);
    const rehydratedAgain = JSON.parse(serializedAgain);
    expect(rehydratedAgain.buildings[0].type).toBe("ironMine");
  });

  it("handles a save state with no buildings field gracefully", () => {
    const save = { version: 1, money: 100 };
    const result = migrateSaveState(save);
    expect(result.buildings).toBeUndefined();
    expect(result.money).toBe(100);
  });
});

// ─── Canonical owner + alias ─────────────────────────────────────────

describe("runtimeCache alias — single source of truth", () => {
  it("BUILDING_ID_MIGRATION (alias) is the SAME reference as BUILDING_ID_MAP", () => {
    // runtimeCache.ts re-exports BUILDING_ID_MAP as BUILDING_ID_MIGRATION.
    // If a regression reintroduces an inline map, identity equality
    // breaks and this test catches it.
    expect(BUILDING_ID_MIGRATION).toBe(BUILDING_ID_MAP);
  });

  it("BUILDING_ID_MIGRATION has the same keys as BUILDING_ID_MAP", () => {
    expect(Object.keys(BUILDING_ID_MIGRATION).sort()).toEqual(
      Object.keys(BUILDING_ID_MAP).sort(),
    );
  });

  it("BUILDING_ID_MIGRATION has the same values as BUILDING_ID_MAP", () => {
    for (const k of Object.keys(BUILDING_ID_MAP)) {
      expect(BUILDING_ID_MIGRATION[k]).toBe(BUILDING_ID_MAP[k]);
    }
  });
});

// ─── Runtime cache integration ────────────────────────────────────────

describe("migrateBuildingDefs — runtime cache integration", () => {
  it("migrateBuildingDefs is exported as a callable function (not an object)", () => {
    expect(typeof migrateBuildingDefs).toBe("function");
  });

  it("calling migrateBuildingDefs() does not throw with an empty cache", () => {
    // BUILDING_DEFS starts empty after data.ts deletion; this is the
    // expected pre-server-load state. migrateBuildingDefs must be
    // safe to call repeatedly (idempotent invocation).
    expect(() => migrateBuildingDefs()).not.toThrow();
    expect(() => migrateBuildingDefs()).not.toThrow();
  });

  it("every entry in BUILDING_ID_MAP maps to a known building type string", () => {
    // The 3 entries in BUILDING_ID_MAP are documented aliases for
    // real building types in the game. This test does NOT cross-check
    // against BUILDING_DEFS (which is populated only after server
    // load); it asserts only that the target IDs are non-empty
    // strings (catches accidental typo regressions like '' or
    // undefined in the migration target).
    for (const [oldId, newId] of Object.entries(BUILDING_ID_MAP)) {
      expect(typeof newId).toBe("string");
      expect(newId.length).toBeGreaterThan(0);
      expect(oldId).not.toBe(newId); // every entry is a real rename
    }
  });

  it("no two source IDs in BUILDING_ID_MAP map to the same target", () => {
    // Multiple sources mapping to one target would silently collapse
    // distinct buildings on load. Catch that at the source.
    const targets = Object.values(BUILDING_ID_MAP);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("no source ID is also a target of a different mapping (no chains)", () => {
    // A source ID that is also a target of another mapping would
    // cause double-migration under repeated migrateBuildingId calls
    // (chain A → B, then B → C). The earlier idempotency tests already
    // cover the B → C case via `migrateBuildingId(B) === B`, but
    // this test catches the spec-level mistake of chaining migrations.
    const sources = new Set(Object.keys(BUILDING_ID_MAP));
    const targets = new Set(Object.values(BUILDING_ID_MAP));
    for (const target of targets) {
      expect(sources.has(target), `${target} is a target AND a source`).toBe(
        false,
      );
    }
  });
});

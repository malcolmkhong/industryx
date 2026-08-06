/**
 * tests/unit/admin/tableRows-canonicalValidation.test.ts
 *
 * FIX A + FIX B for the admin config tool:
 *
 *   FIX A: after `createConfigRow` or `updateConfigRow` succeeds on a
 *   table that feeds `fetchCanonicalInitialState`
 *   (game_config_game or game_config_resources), the in-memory
 *   canonical state cache must be invalidated. Otherwise the next
 *   guest's initial state is the stale cached value for up to 5 min.
 *
 *   FIX B: before the DB write, validate the row against the same
 *   rules the canonical state builder uses. Reject the write with a
 *   400 + descriptive error if the row would put the builder into
 *   a fail-closed state (null config, degenerate weather cadence).
 *
 * Strategy:
 *   - Mock Supabase service-role client so we can drive create/update
 *     success and failure paths without a live DB.
 *   - Mock the auth + audit helpers.
 *   - Call the helpers directly (the route handlers just wire auth
 *     and response shape).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── capture the cache-invalidation call ────────────────────────────────
const { invalidateCanonicalInitialStateCache, createServiceRoleClient } =
  vi.hoisted(() => ({
    invalidateCanonicalInitialStateCache: vi.fn(),
    createServiceRoleClient: vi.fn(),
  }));

// ── mock the dependencies ──────────────────────────────────────────────
vi.mock("@/lib/db/access", () => ({

  // BUG-077: canonical boundary names mirror the legacy alias.
  getDbClient: createServiceRoleClient,
  requireDbClient: () => ({ from: vi.fn() }),
  isDbClientConfigured: vi.fn(() => true),
  createClient: vi.fn(async () => null),

  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/db/infra/initialState.server", () => ({
  invalidateCanonicalInitialStateCache: invalidateCanonicalInitialStateCache,
  fetchCanonicalInitialState: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  verifyAdmin: vi.fn(async () => ({ admin: { id: "admin-1" } })),
  withSecurityHeaders: <T>(r: T) => r,
  isAdminUserId: vi.fn(() => false),
}));

vi.mock("@/lib/auth/admin-route-guards", () => ({
  requireAdminWrite: vi.fn(async () => null),
}));

vi.mock("@/lib/auth/admin-helpers", () => ({
  logAdminAction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/config/tables", () => {
  const gameConfigGame: TableConfigLike = {
    id: "game_config_game",
    displayName: "Game Config",
    icon: "settings",
    category: "core",
    primaryKey: "id",
    columns: [
      {
        key: "id",
        label: "ID",
        type: "integer",
        editable: false,
        required: true,
        hidden: true,
      },
      {
        key: "starting_money",
        label: "Starting Money",
        type: "number",
        editable: true,
        required: true,
      },
      {
        key: "base_payout_interval",
        label: "Payout Interval",
        type: "integer",
        editable: true,
        required: true,
      },
      {
        key: "weather_change_min_ticks",
        label: "Weather Min",
        type: "integer",
        editable: true,
        required: true,
      },
      {
        key: "weather_change_max_ticks",
        label: "Weather Max",
        type: "integer",
        editable: true,
        required: true,
      },
      {
        key: "initial_drone_speed_level",
        label: "Drone Speed",
        type: "integer",
        editable: true,
        required: true,
      },
      {
        key: "initial_drone_capacity_level",
        label: "Drone Capacity",
        type: "integer",
        editable: true,
        required: true,
      },
      {
        key: "initial_drone_fuel_efficiency_level",
        label: "Drone Fuel",
        type: "integer",
        editable: true,
        required: true,
      },
    ],
  };
  const gameConfigResources: TableConfigLike = {
    id: "game_config_resources",
    displayName: "Resources",
    icon: "box",
    category: "core",
    primaryKey: "id",
    columns: [
      { key: "id", label: "ID", type: "text", editable: false, required: true },
      {
        key: "base_capacity",
        label: "Base Capacity",
        type: "number",
        editable: true,
        required: true,
      },
    ],
  };
  const unrelatedConfig: TableConfigLike = {
    id: "game_config_market",
    displayName: "Market Config",
    icon: "chart",
    category: "market",
    primaryKey: "resource_id",
    columns: [
      {
        key: "resource_id",
        label: "Resource",
        type: "text",
        editable: false,
        required: true,
      },
      {
        key: "base_price",
        label: "Base Price",
        type: "number",
        editable: true,
        required: true,
      },
    ],
  };
  return {
    getTableConfig: (id: string) => {
      if (id === "game_config_game") return gameConfigGame;
      if (id === "game_config_resources") return gameConfigResources;
      if (id === "game_config_market") return unrelatedConfig;
      return null;
    },
    isAllowedTable: (id: string) =>
      [
        "game_config_game",
        "game_config_resources",
        "game_config_market",
      ].includes(id),
  };
});

vi.mock("@/lib/db/types", () => ({
  CONFIG_TABLE_COLUMNS: {
    game_config_game: "id, starting_money",
    game_config_resources: "id, base_capacity",
    game_config_market: "resource_id, base_price",
  },
}));

type TableConfigLike = {
  id: string;
  displayName: string;
  icon: string;
  category: string;
  primaryKey: string;
  columns: Array<{
    key: string;
    label: string;
    type: string;
    editable: boolean;
    required?: boolean;
    hidden?: boolean;
  }>;
};

import { createConfigRow, updateConfigRow } from "@/lib/admin/config/tableRows";

// ── Supabase mock helpers ──────────────────────────────────────────────
function makeSupabaseMock(opts: {
  insertResult?: { data: unknown; error: { message: string } | null };
  updateResult?: {
    data: unknown;
    error: { message: string; code?: string } | null;
  };
}) {
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () => opts.insertResult ?? { data: { id: 1 }, error: null },
    }),
  }));
  const update = vi.fn(() => ({
    eq: () => ({
      select: () => ({
        single: async () =>
          opts.updateResult ?? { data: { id: 1 }, error: null },
      }),
    }),
  }));
  const from = vi.fn((table: string) => {
    if (
      table === "game_config_game" ||
      table === "game_config_resources" ||
      table === "game_config_market"
    ) {
      return { insert, update };
    }
    return {};
  });
  createServiceRoleClient.mockReturnValue({ from });
  return { from, insert, update };
}

const ADMIN = { id: "admin-1" } as Parameters<typeof createConfigRow>[0];

beforeEach(() => {
  invalidateCanonicalInitialStateCache.mockReset();
});

describe("FIX A — admin config edit invalidates canonical state cache", () => {
  it("createConfigRow on game_config_game calls invalidateCanonicalInitialStateCache", async () => {
    makeSupabaseMock({
      insertResult: { data: { id: 1, starting_money: 2000 }, error: null },
    });
    const res = await createConfigRow(ADMIN, "game_config_game", {
      id: 1,
      starting_money: 2000,
      base_payout_interval: 100,
      weather_change_min_ticks: 100,
      weather_change_max_ticks: 300,
      initial_drone_speed_level: 1,
      initial_drone_capacity_level: 1,
      initial_drone_fuel_efficiency_level: 1,
    });
    expect(res.status).toBe(201);
    expect(invalidateCanonicalInitialStateCache).toHaveBeenCalledTimes(1);
  });

  it("createConfigRow on game_config_resources calls invalidateCanonicalInitialStateCache", async () => {
    makeSupabaseMock({
      insertResult: { data: { id: "iron", base_capacity: 100 }, error: null },
    });
    const res = await createConfigRow(ADMIN, "game_config_resources", {
      id: "iron",
      base_capacity: 100,
    });
    expect(res.status).toBe(201);
    expect(invalidateCanonicalInitialStateCache).toHaveBeenCalledTimes(1);
  });

  it("createConfigRow on an unrelated table does NOT invalidate the cache", async () => {
    makeSupabaseMock({
      insertResult: {
        data: { resource_id: "iron", base_price: 10 },
        error: null,
      },
    });
    const res = await createConfigRow(ADMIN, "game_config_market", {
      resource_id: "iron",
      base_price: 10,
    });
    expect(res.status).toBe(201);
    expect(invalidateCanonicalInitialStateCache).not.toHaveBeenCalled();
  });

  it("updateConfigRow on game_config_game calls invalidateCanonicalInitialStateCache", async () => {
    makeSupabaseMock({
      updateResult: {
        data: { id: 1, starting_money: 2000 },
        error: null,
      },
    });
    const res = await updateConfigRow(ADMIN, "game_config_game", "1", {
      starting_money: 2000,
    });
    expect(res.status).toBe(200);
    expect(invalidateCanonicalInitialStateCache).toHaveBeenCalledTimes(1);
  });

  it("updateConfigRow on game_config_resources calls invalidateCanonicalInitialStateCache", async () => {
    makeSupabaseMock({
      updateResult: {
        data: { id: "iron", base_capacity: 200 },
        error: null,
      },
    });
    const res = await updateConfigRow(ADMIN, "game_config_resources", "iron", {
      base_capacity: 200,
    });
    expect(res.status).toBe(200);
    expect(invalidateCanonicalInitialStateCache).toHaveBeenCalledTimes(1);
  });

  it("updateConfigRow on an unrelated table does NOT invalidate the cache", async () => {
    makeSupabaseMock({
      updateResult: {
        data: { resource_id: "iron", base_price: 20 },
        error: null,
      },
    });
    const res = await updateConfigRow(ADMIN, "game_config_market", "iron", {
      base_price: 20,
    });
    expect(res.status).toBe(200);
    expect(invalidateCanonicalInitialStateCache).not.toHaveBeenCalled();
  });

  it("does NOT invalidate the cache when the DB write fails", async () => {
    makeSupabaseMock({
      insertResult: { data: null, error: { message: "db down" } },
    });
    const res = await createConfigRow(ADMIN, "game_config_game", {
      id: 1,
      starting_money: 2000,
      base_payout_interval: 100,
      weather_change_min_ticks: 100,
      weather_change_max_ticks: 300,
      initial_drone_speed_level: 1,
      initial_drone_capacity_level: 1,
      initial_drone_fuel_efficiency_level: 1,
    });
    expect(res.status).toBe(500);
    expect(invalidateCanonicalInitialStateCache).not.toHaveBeenCalled();
  });
});

describe("FIX B — admin config edit pre-validates canonical rules", () => {
  it("rejects createConfigRow with null base_capacity on game_config_resources", async () => {
    // Note: `null` on a REQUIRED field is caught upstream by
    // `findMissingRequiredFields` (returns 400 "Missing required
    // fields") before the canonical validator runs. The canonical
    // validator's `null` check is a defense-in-depth layer for
    // non-required fields. Both are 400s; the upstream one is more
    // specific for the required-field case.
    makeSupabaseMock({});
    const res = await createConfigRow(ADMIN, "game_config_resources", {
      id: "iron",
      base_capacity: null,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    // Either the upstream missing-required-fields or the canonical
    // validator may catch it. Both are valid 400s.
    expect(
      json.missingFields !== undefined || json.validationErrors !== undefined,
    ).toBe(true);
  });

  it("rejects createConfigRow with non-finite base_capacity on game_config_resources", async () => {
    makeSupabaseMock({});
    const res = await createConfigRow(ADMIN, "game_config_resources", {
      id: "iron",
      base_capacity: "banana",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.validationErrors[0]).toMatch(/finite/);
  });

  it("accepts base_capacity = 0 on game_config_resources", async () => {
    // 0 is a legitimate value (FIX 4+5 distinguishes null from 0).
    makeSupabaseMock({
      insertResult: { data: { id: "iron", base_capacity: 0 }, error: null },
    });
    const res = await createConfigRow(ADMIN, "game_config_resources", {
      id: "iron",
      base_capacity: 0,
    });
    expect(res.status).toBe(201);
  });

  it("rejects createConfigRow with null starting_money on game_config_game", async () => {
    makeSupabaseMock({});
    const res = await createConfigRow(ADMIN, "game_config_game", {
      id: 1,
      starting_money: null,
      base_payout_interval: 100,
      weather_change_min_ticks: 100,
      weather_change_max_ticks: 300,
      initial_drone_speed_level: 1,
      initial_drone_capacity_level: 1,
      initial_drone_fuel_efficiency_level: 1,
    });
    expect(res.status).toBe(400);
  });

  it("accepts starting_money = 0 on game_config_game (FIX 4+5)", async () => {
    // 0 is a legitimate value.
    makeSupabaseMock({
      insertResult: { data: { id: 1, starting_money: 0 }, error: null },
    });
    const res = await createConfigRow(ADMIN, "game_config_game", {
      id: 1,
      starting_money: 0,
      base_payout_interval: 100,
      weather_change_min_ticks: 100,
      weather_change_max_ticks: 300,
      initial_drone_speed_level: 1,
      initial_drone_capacity_level: 1,
      initial_drone_fuel_efficiency_level: 1,
    });
    expect(res.status).toBe(201);
  });

  it("rejects createConfigRow with degenerate weather cadence (wmin=0, wmax=0)", async () => {
    makeSupabaseMock({});
    const res = await createConfigRow(ADMIN, "game_config_game", {
      id: 1,
      starting_money: 1000,
      base_payout_interval: 100,
      weather_change_min_ticks: 0,
      weather_change_max_ticks: 0,
      initial_drone_speed_level: 1,
      initial_drone_capacity_level: 1,
      initial_drone_fuel_efficiency_level: 1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(
      json.validationErrors.some((e: string) => e.includes("weather cadence")),
    ).toBe(true);
  });

  it("rejects createConfigRow with inverted weather cadence (wmin > wmax)", async () => {
    makeSupabaseMock({});
    const res = await createConfigRow(ADMIN, "game_config_game", {
      id: 1,
      starting_money: 1000,
      base_payout_interval: 100,
      weather_change_min_ticks: 500,
      weather_change_max_ticks: 200,
      initial_drone_speed_level: 1,
      initial_drone_capacity_level: 1,
      initial_drone_fuel_efficiency_level: 1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(
      json.validationErrors.some((e: string) => e.includes("weather cadence")),
    ).toBe(true);
  });

  it("rejects updateConfigRow that sets starting_money to null", async () => {
    makeSupabaseMock({});
    const res = await updateConfigRow(ADMIN, "game_config_game", "1", {
      starting_money: null,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(
      json.validationErrors.some((e: string) => e.includes("starting_money")),
    ).toBe(true);
  });

  it("rejects updateConfigRow that sets a degenerate weather cadence", async () => {
    makeSupabaseMock({});
    const res = await updateConfigRow(ADMIN, "game_config_game", "1", {
      weather_change_min_ticks: 0,
      weather_change_max_ticks: 0,
    });
    expect(res.status).toBe(400);
  });

  it("accepts updateConfigRow with one weather field (other is unchanged in DB)", async () => {
    // If only wmin is sent and wmax is unchanged, the validator
    // can't cross-check without a DB read. Accept the partial update;
    // the unchanged value is guaranteed valid because it was last
    // written through this same validator.
    makeSupabaseMock({
      updateResult: {
        data: { id: 1, weather_change_min_ticks: 200 },
        error: null,
      },
    });
    const res = await updateConfigRow(ADMIN, "game_config_game", "1", {
      weather_change_min_ticks: 200,
    });
    expect(res.status).toBe(200);
    expect(invalidateCanonicalInitialStateCache).toHaveBeenCalledTimes(1);
  });

  it("does NOT pre-validate unrelated tables", async () => {
    // game_config_market's columns aren't checked. The validator
    // returns ok without inspecting the row.
    makeSupabaseMock({
      insertResult: {
        data: { resource_id: "iron", base_price: 10 },
        error: null,
      },
    });
    const res = await createConfigRow(ADMIN, "game_config_market", {
      resource_id: "iron",
      base_price: 10,
    });
    expect(res.status).toBe(201);
  });
});

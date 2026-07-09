/**
 * tests/unit/initialState.server.test.ts — Phase 12 + Phase 13 (Option C)
 *
 * Unit tests for the server-authoritative `fetchCanonicalInitialState()`
 * helper. Validates that the canonical ServerGameData is built correctly
 * from Supabase `game_config_*` tables, fail-closes on errors, uses
 * server-side crypto.randomUUID / weather.nextChange range, and
 * returns PURE ServerGameData (NO UI fields).
 *
 * Phase 13 invariant: the helper MUST NOT include
 * `hydrated` / `activeTab` / `selectedBuilding` / `notifications` /
 * `productionSnapshot` in its return shape. Those are added by the
 * client during hydration via `mergeCanonicalWithUI()`.
 *
 * Companion to the API route test at `tests/api/game/initial-state.test.ts`,
 * the backfill migration `070_backfill_full_state.sql`, and the store
 * helper at `src/lib/game/store-bootstrap.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerGameData, UISessionState } from '@/lib/game/types';

// Mock the Supabase server client BEFORE importing the module under test.
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
  })),
  createClient: vi.fn(async () => null),
  isServiceRoleConfigured: vi.fn(() => true),
  isSupabaseConfigured: vi.fn(() => true),
}));

// Mock configCache + configLoader.server to short-circuit DB calls there.
vi.mock('@/lib/game/configLoader.server', () => ({
  ensureConfigLoaded: vi.fn(async () => ({ ok: true })),
}));

// Mock configCache exports
vi.mock('@/lib/game/configCache', () => ({
  INITIAL_MARKET: [
    { resource: 'iron', basePrice: 10, currentPrice: 10, priceHistory: [], demand: 0.5, supply: 0.5, volatility: 0.1 },
    { resource: 'copper', basePrice: 8, currentPrice: 8, priceHistory: [], demand: 0.5, supply: 0.5, volatility: 0.1 },
  ],
  AUTOMATION_UNLOCKS: [],
  PRESTIGE_BONUSES: [],
  QUEST_DEFS: [],
  INITIAL_MEGA_PROJECTS: [],
}));

// Note (Phase 13): emptyProductionSnapshot is intentionally NOT mocked
// here — the server helper no longer calls it (it returned UI state).
// Phase 13 invariant: the helper returns ONLY ServerGameData.

// crypto.randomUUID present in Node ≥ 19; vitest uses Node ≥ 20. No mock needed.

import { fetchCanonicalInitialState } from '@/lib/db/initialState.server';

const fakeResources = [
  { id: 'iron', base_capacity: 100 },
  { id: 'copper', base_capacity: 100 },
  { id: 'lithium', base_capacity: 50 },
  { id: 'rareEarth', base_capacity: 20 },
];

const fakeGameRow = {
  starting_money: 2000,
  base_payout_interval: 100,
  weather_change_min_ticks: 100,
  weather_change_max_ticks: 300,
  initial_drone_speed_level: 1,
  initial_drone_capacity_level: 1,
  initial_drone_fuel_efficiency_level: 1,
};

function configureMockSupabase(opts: {
  resources?: { id: string; base_capacity: number }[];
  game?: typeof fakeGameRow | null;
  resourcesError?: string | null;
  gameError?: string | null;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'game_config_resources') {
      return {
        select: () => ({
          data: opts.resourcesError ? null : (opts.resources ?? fakeResources),
          error: opts.resourcesError ? { message: opts.resourcesError } : null,
        }),
      };
    }
    if (table === 'game_config_game') {
      return {
        select: () => ({
          limit: () => ({
            data: opts.gameError
              ? null
              : opts.game === null
                ? []
                : [(opts.game ?? fakeGameRow)],
            error: opts.gameError ? { message: opts.gameError } : null,
          }),
        }),
      };
    }
    return {
      select: () => ({ data: [], error: null }),
    };
  });
}

describe('fetchCanonicalInitialState (server-authoritative)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    // Default to a healthy DB response so each test can opt-in to failures.
    configureMockSupabase({});
  });

  it('returns ServerGameData (not GameState) — type-level check', async () => {
    const state: ServerGameData = await fetchCanonicalInitialState();
    // Type assignment succeeds. The presence/absence of UI keys is
    // asserted in the next test.
    expect(state).toBeDefined();
    expect(state.money).toBeDefined();
  });

  it('builds a full ServerGameData from config rows', async () => {
    const state = await fetchCanonicalInitialState();
    // money comes from game_config_game.starting_money
    expect(state.money).toBe(2000);
    // spend/income invariant: seed is NOT earned
    expect(state.totalMoneyEarned).toBe(0);
    expect(state.gameTick).toBe(0);
    expect(state.gameSpeed).toBe(1);
    expect(state.paused).toBe(false);
    // resources is an empty map for every resource in game_config_resources
    expect(state.resources).toEqual({ iron: 0, copper: 0, lithium: 0, rareEarth: 0 });
    // resourceCapacity matches base_capacity
    expect(state.resourceCapacity).toEqual({
      iron: 100, copper: 100, lithium: 50, rareEarth: 20,
    });
    // empty arrays/objects per canonical
    expect(state.buildings).toEqual([]);
    expect(state.workers).toEqual([]);
    expect(state.contracts).toEqual([]);
    expect(state.completedResearch).toEqual([]);
    expect(state.researchPoints).toBe(0);
    // payout interval from DB
    expect(state.payoutConfig.basePayoutInterval).toBe(100);
    expect(state.payoutConfig.autoCollect).toBe(true);
    // prestige state canonical defaults
    expect(state.prestigeState.totalPrestiges).toBe(0);
    expect(state.prestigeState.corporationPoints).toBe(0);
    expect(state.prestigeState.megaFactoryUnlocked).toBe(false);
    // drones.fleet[0] uses DB-config drone defaults
    expect(state.drones.fleet).toHaveLength(1);
    const drone = state.drones.fleet[0];
    expect(drone.status).toBe('idle');
    expect(drone.speedLevel).toBe(1);
    expect(drone.capacityLevel).toBe(1);
    expect(drone.fuelEfficiencyLevel).toBe(1);
    expect(drone.missionId).toBeNull();
    expect(drone.missionEndTick).toBe(0);
    // drone.id is a UUID (not Math.random)
    expect(drone.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    // weather.nextChange in [100, 400)  (range min..max+min minus 1)
    expect(state.weather.nextChange).toBeGreaterThanOrEqual(100);
    expect(state.weather.nextChange).toBeLessThan(400);
    expect(state.weather.current).toBe('clear');
  });

  // ── Phase 13 invariants — UI fields MUST NOT be in ServerGameData ─────

  it('does NOT include hydrated (UI flag)', async () => {
    const state = await fetchCanonicalInitialState();
    expect('hydrated' in state).toBe(false);
  });

  it('does NOT include activeTab (UI flag)', async () => {
    const state = await fetchCanonicalInitialState();
    expect('activeTab' in state).toBe(false);
  });

  it('does NOT include selectedBuilding (UI flag)', async () => {
    const state = await fetchCanonicalInitialState();
    expect('selectedBuilding' in state).toBe(false);
  });

  it('does NOT include notifications (UI flag)', async () => {
    const state = await fetchCanonicalInitialState();
    expect('notifications' in state).toBe(false);
  });

  it('does NOT include productionSnapshot (UI flag)', async () => {
    const state = await fetchCanonicalInitialState();
    expect('productionSnapshot' in state).toBe(false);
  });

  it('shape has only ServerGameData keys (UI keys excluded)', async () => {
    const state = await fetchCanonicalInitialState();
    const stateRecord = state as unknown as Record<string, unknown>;
    const UI_KEYS: (keyof UISessionState)[] = [
      'hydrated',
      'activeTab',
      'selectedBuilding',
      'notifications',
      'productionSnapshot',
    ];
    for (const k of UI_KEYS) {
      expect(stateRecord[k]).toBeUndefined();
    }
  });

  it('stats.totalResourcesProduced has a zero entry for every resource', async () => {
    const state = await fetchCanonicalInitialState();
    expect(state.stats.totalResourcesProduced).toEqual({
      iron: 0, copper: 0, lithium: 0, rareEarth: 0,
    });
    expect(state.stats.totalResourcesSold).toEqual({
      iron: 0, copper: 0, lithium: 0, rareEarth: 0,
    });
    expect(state.stats.factoriesBuilt).toBe(0);
    expect(state.stats.contractsCompleted).toBe(0);
    expect(state.stats.playTime).toBe(0);
  });

  it('fails closed when game_config_resources errors', async () => {
    configureMockSupabase({ resourcesError: 'connection timeout' });
    await expect(fetchCanonicalInitialState()).rejects.toThrow(/game_config_resources/);
  });

  it('fails closed when game_config_resources returns empty', async () => {
    configureMockSupabase({ resources: [] });
    await expect(fetchCanonicalInitialState()).rejects.toThrow(/game_config_resources/);
  });

  it('fails closed when game_config_game errors', async () => {
    configureMockSupabase({ gameError: 'timeout' });
    await expect(fetchCanonicalInitialState()).rejects.toThrow(/game_config_game/);
  });

  it('fails closed when game_config_game returns no rows', async () => {
    configureMockSupabase({ game: null });
    await expect(fetchCanonicalInitialState()).rejects.toThrow(/game_config_game/);
  });

  it('uses starting_money from DB (not hardcoded 1000)', async () => {
    configureMockSupabase({ game: { ...fakeGameRow, starting_money: 9999 } });
    const state = await fetchCanonicalInitialState();
    expect(state.money).toBe(9999);
  });

  it('handles missing weather cadence gracefully (falls back to 100/300)', async () => {
    configureMockSupabase({
      game: {
        ...fakeGameRow,
        weather_change_min_ticks: 0, // trigger fallback (Number() || 100)
        weather_change_max_ticks: 0,
      },
    });
    const state = await fetchCanonicalInitialState();
    // Fallback values: min=100, max=300, nextChange ∈ [100, 400)
    expect(state.weather.nextChange).toBeGreaterThanOrEqual(100);
    expect(state.weather.nextChange).toBeLessThan(400);
  });

  it('does not mutate cached state between calls (each returns fresh clones)', async () => {
    const a = await fetchCanonicalInitialState();
    a.money = 12345;
    a.buildings.push({ id: 'foreign', type: 'ironMine' as never, level: 1, efficiency: 1, active: true, placedAt: 0 });
    const b = await fetchCanonicalInitialState();
    expect(b.money).toBe(2000); // unchanged
    expect(b.buildings).toEqual([]); // unchanged
  });
});

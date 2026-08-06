/**
 * serverGameState — Centralized access to the `server_game_state` table.
 *
 * This module is the ONLY place in the codebase that should call
 * `.from('server_game_state')`. All API routes and library code must
 * import query functions from here instead of touching the table directly.
 *
 * Iteration 1 of the Database Centralization migration (2026-06-20).
 * Migrated routes: /api/game/state/sync, /api/market/trades/execute, /api/game/state/offline-progress,
 *   /api/game/actions/legacy, /api/cron/validate-ticks, /api/auth/claim-guest,
 *   /api/auth/identity/link.
 *
 * Conventions (decided in Phase 2 of the audit):
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 *   - Optimistic-locking updates accept `expectedStateVersion` for CAS.
 *
 * Affected files (Iteration 1):
 *   - src/lib/db/serverGameState.ts            (NEW)
 *   - src/app/api/game/state/sync/route.ts          (3 call sites)
 *   - src/app/api/market/trades/execute/route.ts          (2 call sites)
 *   - src/app/api/game/state/offline-progress/route.ts        (2 call sites)
 *   - src/app/api/game/actions/legacy/route.ts         (2 call sites)
 *   - src/app/api/cron/validate-ticks/route.ts (1 call site)
 *   - src/app/api/auth/claim-guest/route.ts    (1 call site)
 *   - src/app/api/auth/identity/link/route.ts  (2 call sites)
 */

import { getDbClient } from "@/lib/db/access";
import type { Database } from "@/lib/db/types";
import { generateChecksum } from "@/lib/auth/gameStateValidator";
import { fetchCanonicalInitialState } from "@/lib/db/infra/initialState.server";
import type {
  Quest,
  QuestStep,
  ServerGameData,
} from "@/lib/game/shared/types/types";
import {
  asFullState,
  stripUIFields,
} from "@/lib/db/game/serverGameStatePayload";

// Type aliases sourced from the generated Supabase types.
// These are the single source of truth for row shapes.
type ServerGameStateRow =
  Database["public"]["Tables"]["server_game_state"]["Row"];
type ServerGameStateInsert =
  Database["public"]["Tables"]["server_game_state"]["Insert"];
type ServerGameStateUpdate =
  Database["public"]["Tables"]["server_game_state"]["Update"];

/**
 * Narrow shape returned by `loadServerGameStateLite` — only the columns
 * needed for `state/route.ts` GET. Avoids loading the 2MB+ `full_state`
 * JSON when not required.
 */
export type ServerGameStateLite = Pick<
  ServerGameStateRow,
  | "full_state"
  | "money"
  | "total_money_earned"
  | "research_points"
  | "buildings"
  | "buildings_count"
  | "completed_research"
  | "resources"
  | "workers"
  | "game_tick"
  | "game_speed"
  | "state_hash"
  | "state_version"
  | "last_tick_at"
  | "last_saved_at"
  | "cheat_flag_count"
>;

type ServerGameStateHydrationColumns = {
  full_state: unknown;
  money: unknown;
  total_money_earned: unknown;
  research_points: unknown;
  buildings: unknown;
  completed_research: unknown;
  resources: unknown;
  workers: unknown;
  game_tick: unknown;
  game_speed: unknown;
};

/**
 * Narrow shape for the offline tick flow (POST /api/game/state/offline-progress).
 */
export type ServerGameStateForTick = Pick<
  ServerGameStateRow,
  | "full_state"
  | "game_tick"
  | "game_speed"
  | "state_version"
  | "last_tick_at"
  | "money"
  | "total_money_earned"
  | "research_points"
  | "buildings"
  | "completed_research"
  | "resources"
  | "workers"
  | "is_locked"
  | "lock_reason"
>;

/**
 * Narrow shape for the trade read path.
 */
export type ServerGameStateForTrade = Pick<
  ServerGameStateRow,
  "resources" | "full_state" | "game_tick" | "state_version" | "last_trade_at"
>;

/**
 * Narrow shape for the action validation path. Includes the fields needed
 * by Phase 7's on-demand tick injection (last_tick_at, game_speed,
 * buildings_count) and by Phase 1+2's persistence (buildings_count).
 */
export type ServerGameStateForAction = Pick<
  ServerGameStateRow,
  | "full_state"
  | "money"
  | "total_money_earned"
  | "game_tick"
  | "game_speed"
  | "state_version"
  | "state_hash"
  | "last_tick_at"
  | "last_saved_at"
  | "buildings"
  | "buildings_count"
  | "resources"
  | "research_points"
  | "completed_research"
  | "workers"
  | "is_locked"
  | "lock_reason"
  | "cheat_flag_count"
>;

/**
 * Narrow shape for the link-identity preview path.
 */
export type ServerGameStateForPreview = Pick<
  ServerGameStateRow,
  "money" | "total_money_earned" | "buildings_count" | "game_tick" | "is_locked"
>;

/**
 * Narrow shape for the validate-ticks cron spot-check (active players query).
 *
 * Phase 5.4 anti-cheat: deliberately excludes `full_state` to minimize Supabase
 * egress. Most cron runs do a cheap scan; only when a player looks suspicious
 * does the cron fetch `full_state` via loadFullStateForUser() for a deep check.
 */
export type ServerGameStateForCron = Pick<
  ServerGameStateRow,
  | "user_id"
  | "game_tick"
  | "game_speed"
  | "last_tick_at"
  | "money"
  | "total_money_earned"
>;

/**
 * Check if the server_game_state client is reachable. Used by callers that
 * want a clean 503 response when Supabase is not configured.
 */
export function isServerGameStateAvailable(): boolean {
  return getDbClient() !== null;
}

/**
 * Load the lite (non-full_state) game state for a user. Used by GET /api/game/state/sync.
 * Returns null if not found OR if the table is unavailable.
 */
export async function loadServerGameStateLite(
  userId: string,
): Promise<ServerGameStateLite | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select(
      "full_state, money, total_money_earned, research_points, buildings, buildings_count, completed_research, resources, workers, game_tick, game_speed, state_hash, state_version, last_tick_at, last_saved_at, cheat_flag_count",
    )
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as ServerGameStateLite;
}

function requireFiniteNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`[serverGameState] invalid ${field}: ${String(value)}`);
  }
  return n;
}

function requireInteger(value: unknown, field: string): number {
  const n = requireFiniteNumber(value, field);
  if (!Number.isInteger(n)) {
    throw new Error(`[serverGameState] invalid ${field}: ${String(value)}`);
  }
  return n;
}

function recordOr<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  return fallback;
}

function arrayOr<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function isQuestStep(value: unknown): value is Partial<QuestStep> {
  return value !== null && typeof value === "object";
}

function isQuest(value: unknown): value is Partial<Quest> {
  return value !== null && typeof value === "object";
}

function normalizeQuestStep(
  canonicalStep: QuestStep,
  savedStep: unknown,
): QuestStep {
  const saved = isQuestStep(savedStep) ? savedStep : {};
  const current =
    typeof saved.current === "number" && Number.isFinite(saved.current)
      ? saved.current
      : canonicalStep.current;
  const completed =
    typeof saved.completed === "boolean"
      ? saved.completed
      : canonicalStep.completed;
  const id =
    typeof (saved as { id?: unknown }).id === "string"
      ? (saved as { id: string }).id
      : canonicalStep.id;

  return {
    ...canonicalStep,
    id,
    current,
    completed,
  };
}

function mergeQuestsWithCanonical(
  canonicalQuests: Quest[],
  savedQuests: unknown,
): Quest[] {
  if (!Array.isArray(savedQuests) || savedQuests.length === 0) {
    return canonicalQuests.map((quest) => ({
      ...quest,
      steps: quest.steps.map((step) => ({ ...step })),
    }));
  }

  const savedById = new Map(
    savedQuests
      .filter(
        (quest): quest is Partial<Quest> =>
          isQuest(quest) && typeof quest.id === "string",
      )
      .map((quest) => [quest.id as string, quest]),
  );

  return canonicalQuests.map((canonicalQuest) => {
    const savedQuest = savedById.get(canonicalQuest.id);
    const savedSteps = Array.isArray(savedQuest?.steps) ? savedQuest.steps : [];

    return {
      ...canonicalQuest,
      steps: canonicalQuest.steps.map((step, index) =>
        normalizeQuestStep(step, savedSteps[index]),
      ),
      completed:
        typeof savedQuest?.completed === "boolean"
          ? savedQuest.completed
          : canonicalQuest.completed,
      claimed:
        typeof savedQuest?.claimed === "boolean"
          ? savedQuest.claimed
          : canonicalQuest.claimed,
      expiresAt:
        typeof savedQuest?.expiresAt === "number"
          ? savedQuest.expiresAt
          : canonicalQuest.expiresAt,
    };
  });
}

/**
 * Build a complete ServerGameData snapshot for read paths.
 *
 * Production data contains legacy partial `full_state` blobs from migration
 * backfills. The denormalized columns remain authoritative for core fields, so
 * read-side hydration overlays them onto a fresh canonical template before
 * returning/applying state.
 */
export async function buildCompleteFullStateForServerRow(
  row: ServerGameStateHydrationColumns,
): Promise<ServerGameData> {
  const canonical = await fetchCanonicalInitialState();
  const existing =
    row.full_state &&
    typeof row.full_state === "object" &&
    !Array.isArray(row.full_state)
      ? stripUIFields(row.full_state as Record<string, unknown>)
      : {};

  // BUG-093 read-side safety net: if the row is a freshly-bootstrapped
  // placeholder (full_state = {"bootstrap_pending": true}), the denormalized
  // columns are pre-canonical defaults (set by the
  // bootstrap_placeholder_canonical_defaults trigger, or zero/legacy on
  // rows created before the trigger shipped). Trusting them would override
  // canonical.money with row.money = 0 and ship a $0 ServerGameData to the
  // client. Skip the overrides entirely so canonical wins.
  const isPlaceholder =
    existing &&
    typeof existing === "object" &&
    (existing as { bootstrap_pending?: unknown }).bootstrap_pending === true;

  return {
    ...canonical,
    ...(isPlaceholder ? {} : existing),
    quests: mergeQuestsWithCanonical(canonical.quests, existing.quests),
    money: isPlaceholder
      ? canonical.money
      : requireFiniteNumber(row.money, "money"),
    totalMoneyEarned: isPlaceholder
      ? canonical.totalMoneyEarned
      : requireFiniteNumber(row.total_money_earned, "total_money_earned"),
    researchPoints: isPlaceholder
      ? canonical.researchPoints
      : requireFiniteNumber(row.research_points, "research_points"),
    buildings: isPlaceholder
      ? canonical.buildings
      : arrayOr(row.buildings, canonical.buildings),
    completedResearch: isPlaceholder
      ? canonical.completedResearch
      : arrayOr(row.completed_research, canonical.completedResearch),
    resources: isPlaceholder
      ? canonical.resources
      : recordOr(row.resources, canonical.resources),
    workers: isPlaceholder
      ? canonical.workers
      : arrayOr(row.workers, canonical.workers),
    gameTick: isPlaceholder
      ? canonical.gameTick
      : requireInteger(row.game_tick, "game_tick"),
    gameSpeed: isPlaceholder
      ? canonical.gameSpeed
      : requireInteger(row.game_speed, "game_speed"),
  };
}

/**
 * Load only the fields needed for offline tick computation.
 */
export async function loadServerGameStateForTick(
  userId: string,
): Promise<ServerGameStateForTick | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select(
      "full_state, game_tick, game_speed, state_version, last_tick_at, " +
        "money, total_money_earned, research_points, buildings, " +
        "completed_research, resources, workers, is_locked, lock_reason",
    )
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  const row = data as unknown as ServerGameStateForTick;
  return {
    ...row,
    full_state: asFullState(await buildCompleteFullStateForServerRow(row)),
  };
}

/**
 * Load the fields needed for leaderboard submission: total_money_earned, game_tick, is_locked, lock_reason, and money.
 */
export async function loadServerGameStateForLeaderboard(
  userId: string,
): Promise<Pick<
  ServerGameStateRow,
  "total_money_earned" | "game_tick" | "is_locked" | "lock_reason" | "money"
> | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select("total_money_earned, game_tick, is_locked, lock_reason, money")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as Pick<
    ServerGameStateRow,
    "total_money_earned" | "game_tick" | "is_locked" | "lock_reason" | "money"
  >;
}

/**
 * Load only the fields needed for trade (resources + cooldown + version).
 */
export async function loadServerGameStateForTrade(
  userId: string,
): Promise<ServerGameStateForTrade | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select("resources, full_state, game_tick, state_version, last_trade_at")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as ServerGameStateForTrade;
}

/**
 * Load only the fields needed for action validation.
 */
export async function loadServerGameStateForAction(
  userId: string,
): Promise<ServerGameStateForAction | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select(
      "full_state, money, total_money_earned, game_tick, game_speed, " +
        "state_version, state_hash, last_tick_at, last_saved_at, " +
        "buildings, buildings_count, resources, research_points, " +
        "completed_research, workers, is_locked, lock_reason, cheat_flag_count",
    )
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  const row = data as unknown as ServerGameStateForAction;
  return {
    ...row,
    full_state: asFullState(await buildCompleteFullStateForServerRow(row)),
  };
}

/**
 * Load only the fields needed for link-identity preview.
 */
export async function loadServerGameStateForPreview(
  userId: string,
): Promise<ServerGameStateForPreview | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select("money, total_money_earned, buildings_count, game_tick, is_locked")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as ServerGameStateForPreview | null;
}

/**
 * Load active players for the validate-ticks cron. Filters by
 * `last_tick_at > cutoffISO`. Returns an array (not a single row).
 */
export async function loadActivePlayersSince(
  cutoffISO: string,
): Promise<ServerGameStateForCron[]> {
  const supabase = getDbClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("server_game_state")
    .select(
      "user_id, game_tick, game_speed, last_tick_at, money, total_money_earned",
    )
    .gt("last_tick_at", cutoffISO)
    .returns<ServerGameStateForCron[]>();

  if (error) throw error;
  return data ?? [];
}

/**
 * Lazy-load the full state of a single user for deep anti-cheat check.
 *
 * Phase 5.4: Only called when the cheap spot-check flags a player as
 * suspicious. This avoids transferring the (potentially large) `full_state`
 * JSON blob for the ~99% of players who are clean.
 */
export async function loadFullStateForUser(
  userId: string,
): Promise<{ full_state: unknown; game_tick: number; money: number } | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select("full_state, game_tick, money")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as { full_state: unknown; game_tick: number; money: number };
}

/**
 * Load the fields used by POST /api/game/state/sync for delta validation:
 *   full_state, state_hash, game_tick, cheat_flag_count, state_version,
 *   resources, money, research_points, buildings
 */
export type ServerGameStateForDeltaCheck = Pick<
  ServerGameStateRow,
  | "full_state"
  | "state_hash"
  | "game_tick"
  | "cheat_flag_count"
  | "state_version"
  | "resources"
  | "money"
  | "research_points"
  | "buildings"
>;

export async function loadServerGameStateForDeltaCheck(
  userId: string,
): Promise<ServerGameStateForDeltaCheck | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .select(
      "full_state, state_hash, game_tick, cheat_flag_count, state_version, resources, money, research_points, buildings",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as ServerGameStateForDeltaCheck | null;
}

/**
 * Upsert a user's game state. Used by POST /api/game/state/sync when no
 * prior row may exist. Inserts on `user_id` conflict.
 */
export async function upsertServerGameState(
  values: ServerGameStateInsert,
): Promise<ServerGameStateRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .upsert(values, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    console.error("[serverGameState] upsert error:", error);
    return null;
  }
  return data as ServerGameStateRow;
}

/**
 * Insert the initial game state for a brand-new guest user.
 * Duplicate-row guard is the `server_game_state.user_id` PRIMARY KEY
 * (concurrent INSERTs fail with 23505 → caller surfaces 500).
 *
 * Phase 12 (2026-07-10): the row is now seeded from
 * `fetchCanonicalInitialState()` so that `full_state` carries the full
 * 30+ field GameState template (resourceCapacity, drones, weather,
 * payoutConfig, megaProjects, quests, stats, ...). This fixes the P0
 * data-loss bug where the previous implementation inserted an empty
 * `full_state = {}` and a subsequent 409 auto-hydrate would wipe the
 * client's local state.
 *
 * `state_hash` is NOT NULL on the schema — every new row must carry a
 * valid HMAC. Computed here from the canonical full state so the first
 * server-validated save matches what the client will see.
 */
export async function initializeGuestGameState(
  userId: string,
): Promise<ServerGameStateRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  let canonical: ServerGameData;
  try {
    canonical = await fetchCanonicalInitialState();
  } catch (err) {
    console.error(
      "[serverGameState] initializeGuestGameState failed to build canonical state:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const stateHash = generateChecksum(
    canonical as unknown as Record<string, unknown>,
  );
  const { data, error } = await supabase
    .from("server_game_state")
    .insert({
      user_id: userId,
      money: canonical.money,
      total_money_earned: 0,
      research_points: canonical.researchPoints,
      buildings: canonical.buildings,
      buildings_count: 0,
      completed_research: canonical.completedResearch,
      resources: canonical.resources,
      workers: canonical.workers,
      game_tick: canonical.gameTick,
      game_speed: canonical.gameSpeed,
      full_state: canonical as unknown as Record<string, unknown>,
      state_hash: stateHash,
      state_version: 1,
      is_locked: false,
      cheat_flag_count: 0,
    })
    .select()
    .single();
  if (error) {
    console.error(
      "[serverGameState] initializeGuestGameState failed:",
      error.message,
    );
    return null;
  }
  return data as ServerGameStateRow;
}

/**
 * Read just `game_tick` for a user. Used by /api/auth/guest/migrate to
 * detect "cloud state already exists — refuse migration".
 * Returns null if the user has no row OR the table is unavailable.
 */
export async function getGameTick(userId: string): Promise<number | null> {
  const supabase = getDbClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("server_game_state")
    .select("game_tick")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[serverGameState] getGameTick failed:", error.message);
    return null;
  }
  return data?.game_tick ?? null;
}

/**
 * Paginated read of `full_state` JSONB for every player. Used by
 * /api/market/supply/aggregate to recompute global supply/demand.
 *
 * Caller passes a page size; returns the next page + whether more rows exist.
 * Avoids loading the entire table into memory at once.
 *
 * PR-BP-2 (V-032): also selects `market_supply` (the server-only
 * per-player supply projection written by `applyElapsedServerTime`).
 * The aggregate cron previously read `full_state.productionSnapshot`,
 * which `stripUIFields` removes — see market_supply_state migration 076.
 */
export async function pageServerGameStateFullState(
  offset: number,
  pageSize: number,
): Promise<{
  rows: { full_state: unknown; market_supply: unknown }[];
  hasMore: boolean;
} | null> {
  const supabase = getDbClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("server_game_state")
    .select("full_state, market_supply")
    .range(offset, offset + pageSize - 1);
  if (error) {
    console.error("[serverGameState] pageFullState failed:", error.message);
    return null;
  }
  return {
    rows: (data ?? []) as { full_state: unknown; market_supply: unknown }[],
    hasMore: (data?.length ?? 0) === pageSize,
  };
}

/**
 * Sync `player_progress.game_state` for backwards compatibility. Used
 * by POST /api/game/state/sync (thin: user_id + game_state only).
 */
export async function syncPlayerProgressGameState(
  userId: string,
  gameState: unknown,
): Promise<void> {
  const supabase = getDbClient();
  if (!supabase) return;

  await supabase.from("player_progress").upsert(
    {
      user_id: userId,
      game_state: asFullState(gameState),
    },
    { onConflict: "user_id" },
  );
}

/**
 * Fallback read of `player_progress.game_state` for backwards compat.
 * Returns the `game_state` JSON when present, otherwise null.
 *
 * NOTE: this lives in serverGameState.ts because it's a sibling read used
 * by the offline-tick flow. Will move to a dedicated `playerProgress.ts`
 * module in Iteration 9.
 */
export async function loadPlayerProgressGameState(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("player_progress")
    .select("game_state")
    .eq("user_id", userId)
    .single();

  if (error || !data?.game_state) return null;
  return data.game_state as Record<string, unknown>;
}

/**
 * Optimistic-locking update: only updates the row if `state_version`
 * still matches `expectedStateVersion`. Used by /api/market/trades/execute to
 * detect concurrent writes.
 *
 * Returns the updated row on success, or `null` on:
 *   - database unavailable
 *   - state version mismatch (caller should 409)
 *   - any other update error
 */
export async function saveServerGameStateOptimistic(
  userId: string,
  expectedStateVersion: number,
  patch: ServerGameStateUpdate,
): Promise<ServerGameStateRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("server_game_state")
    .update(patch)
    .eq("user_id", userId)
    .eq("state_version", expectedStateVersion)
    .select(
      "user_id,full_state,money,total_money_earned,buildings_count,game_tick,game_speed,last_tick_at,last_saved_at,state_version,research_points,resources,workers,is_locked,lock_reason,cheat_flag_count,buildings,completed_research,created_at",
    )
    .single();

  if (error || !data) return null;
  return data as ServerGameStateRow;
}

// ============================================
// Iteration 8 — admin player listing + aggregates
// ============================================

const ADMIN_PLAYER_COLUMNS =
  "user_id, money, total_money_earned, research_points, game_tick, game_speed, buildings_count, cheat_flag_count, is_locked, lock_reason, last_saved_at, created_at";

export interface AdminPlayerRow {
  user_id: string;
  money: number | null;
  total_money_earned: number | null;
  research_points: number | null;
  game_tick: number | null;
  game_speed: number | null;
  buildings_count: number | null;
  cheat_flag_count: number | null;
  is_locked: boolean | null;
  lock_reason: string | null;
  last_saved_at: string | null;
  created_at: string | null;
}

export interface AdminPlayerListResult {
  players: AdminPlayerRow[];
  total: number;
}

/**
 * Search and list players for the admin dashboard.
 * Pass `userIdFilter` (array) to restrict to a specific set of user_ids
 * (used for display-name search that resolves to a set of matching users).
 * Pass `excludeUuid` (e.g. all-zeros) to force an empty result.
 */
export async function listPlayersForAdmin(
  page: number,
  limit: number,
  filters: {
    userIdFilter?: string[];
    excludeUuid?: string;
  } = {},
): Promise<AdminPlayerListResult> {
  const supabase = getDbClient();
  if (!supabase) return { players: [], total: 0 };

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("server_game_state")
    .select(ADMIN_PLAYER_COLUMNS, { count: "exact" })
    .range(from, to)
    .order("created_at", { ascending: false });

  if (filters.userIdFilter && filters.userIdFilter.length > 0) {
    query = query.in("user_id", filters.userIdFilter);
  } else if (filters.excludeUuid) {
    query = query.eq("user_id", filters.excludeUuid);
  }

  const { data, count, error } = await query;
  if (error) return { players: [], total: 0 };
  return { players: (data ?? []) as AdminPlayerRow[], total: count ?? 0 };
}

/**
 * Bulk-load player rows for admin operations (lock, reset, compare).
 */
export async function loadPlayersByIds(
  userIds: string[],
): Promise<AdminPlayerRow[]> {
  if (userIds.length === 0) return [];
  const supabase = getDbClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("server_game_state")
    .select(ADMIN_PLAYER_COLUMNS)
    .in("user_id", userIds);
  return (data ?? []) as AdminPlayerRow[];
}

// Aggregate queries for admin dashboard (economy)

export async function sumMoneyAcrossAllPlayers(): Promise<{
  totalMoney: number;
  totalEarned: number;
  playerCount: number;
}> {
  const supabase = getDbClient();
  if (!supabase) return { totalMoney: 0, totalEarned: 0, playerCount: 0 };
  const { data } = await supabase
    .from("server_game_state")
    .select("money, total_money_earned");
  const rows = data ?? [];
  return {
    totalMoney: rows.reduce((s, r) => s + (Number(r.money) || 0), 0),
    totalEarned: rows.reduce(
      (s, r) => s + (Number(r.total_money_earned) || 0),
      0,
    ),
    playerCount: rows.length,
  };
}

export async function topEarners(limit: number): Promise<AdminPlayerRow[]> {
  const supabase = getDbClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("server_game_state")
    .select(ADMIN_PLAYER_COLUMNS)
    .order("total_money_earned", { ascending: false })
    .limit(limit);
  return (data ?? []) as AdminPlayerRow[];
}

export async function countPlayersTotal(): Promise<number> {
  const supabase = getDbClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("server_game_state")
    .select("user_id", { count: "exact", head: true });
  return count ?? 0;
}

export async function countLockedPlayers(): Promise<number> {
  const supabase = getDbClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("server_game_state")
    .select("user_id", { count: "exact", head: true })
    .eq("is_locked", true);
  return count ?? 0;
}

export async function countActivePlayersSince(
  sinceISO: string,
): Promise<number> {
  const supabase = getDbClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("server_game_state")
    .select("user_id", { count: "exact", head: true })
    .gte("last_saved_at", sinceISO);
  return count ?? 0;
}
// ============================================
// Iteration 8 — bulk lock/unlock helper for admin bulk actions
// ============================================

export async function setPlayerLockStateBulk(
  userIds: string[],
  isLocked: boolean,
  lockReason: string | null,
): Promise<{ successCount: number; failCount: number }> {
  if (userIds.length === 0) return { successCount: 0, failCount: 0 };
  const supabase = getDbClient();
  if (!supabase) return { successCount: 0, failCount: userIds.length };

  const results = await Promise.all(
    userIds.map(async (userId) => {
      const { error } = await supabase
        .from("server_game_state")
        .update({
          is_locked: isLocked,
          lock_reason: isLocked ? lockReason : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      return !error;
    }),
  );
  const successCount = results.filter(Boolean).length;
  const failCount = results.length - successCount;
  return { successCount, failCount };
}

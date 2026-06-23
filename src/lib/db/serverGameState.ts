/**
 * serverGameState — Centralized access to the `server_game_state` table.
 *
 * This module is the ONLY place in the codebase that should call
 * `.from('server_game_state')`. All API routes and library code must
 * import query functions from here instead of touching the table directly.
 *
 * Iteration 1 of the Database Centralization migration (2026-06-20).
 * Migrated routes: /api/game/state, /api/game/trade, /api/game/offline,
 *   /api/game/action, /api/cron/validate-ticks, /api/auth/claim-guest,
 *   /api/auth/link-identity.
 *
 * Conventions (decided in Phase 2 of the audit):
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 *   - Optimistic-locking updates accept `expectedStateVersion` for CAS.
 *
 * Affected files (Iteration 1):
 *   - src/lib/db/serverGameState.ts            (NEW)
 *   - src/app/api/game/state/route.ts          (3 call sites)
 *   - src/app/api/game/trade/route.ts          (2 call sites)
 *   - src/app/api/game/offline/route.ts        (2 call sites)
 *   - src/app/api/game/action/route.ts         (2 call sites)
 *   - src/app/api/cron/validate-ticks/route.ts (1 call site)
 *   - src/app/api/auth/claim-guest/route.ts    (1 call site)
 *   - src/app/api/auth/link-identity/route.ts  (2 call sites)
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

// Type aliases sourced from the generated Supabase types.
// These are the single source of truth for row shapes.
type ServerGameStateRow = Database['public']['Tables']['server_game_state']['Row'];
type ServerGameStateInsert = Database['public']['Tables']['server_game_state']['Insert'];
type ServerGameStateUpdate = Database['public']['Tables']['server_game_state']['Update'];

/**
 * Narrow shape returned by `loadServerGameStateLite` — only the columns
 * needed for `state/route.ts` GET. Avoids loading the 2MB+ `full_state`
 * JSON when not required.
 */
export type ServerGameStateLite = Pick<
  ServerGameStateRow,
  | 'full_state'
  | 'money'
  | 'total_money_earned'
  | 'research_points'
  | 'buildings'
  | 'buildings_count'
  | 'completed_research'
  | 'resources'
  | 'workers'
  | 'game_tick'
  | 'game_speed'
  | 'state_hash'
  | 'state_version'
  | 'last_tick_at'
  | 'last_saved_at'
  | 'cheat_flag_count'
>;

/**
 * Minimal shape used by `GET /api/game/offline` to compute offline ticks.
 */
export type ServerGameStateForOfflineCheck = Pick<
  ServerGameStateRow,
  'full_state' | 'last_saved_at' | 'game_tick' | 'game_speed'
>;

/**
 * Load only the columns needed for offline tick calculation.
 */
export async function loadServerGameStateLiteForOffline(
  userId: string
): Promise<ServerGameStateForOfflineCheck | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select('full_state, last_saved_at, game_tick, game_speed')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ServerGameStateForOfflineCheck;
}

/**
 * Narrow shape for the offline tick flow (POST /api/game/offline).
 */
export type ServerGameStateForTick = Pick<
  ServerGameStateRow,
  | 'full_state'
  | 'game_tick'
  | 'game_speed'
  | 'state_version'
  | 'last_tick_at'
  | 'money'
  | 'is_locked'
  | 'lock_reason'
>;

/**
 * Narrow shape for the trade read path.
 */
export type ServerGameStateForTrade = Pick<
  ServerGameStateRow,
  'resources' | 'full_state' | 'game_tick' | 'state_version' | 'last_trade_at'
>;

/**
 * Narrow shape for the action validation path.
 */
export type ServerGameStateForAction = Pick<
  ServerGameStateRow,
  'full_state' | 'money' | 'game_tick' | 'state_version'
>;

/**
 * Narrow shape for the link-identity preview path.
 */
export type ServerGameStateForPreview = Pick<
  ServerGameStateRow,
  'money' | 'total_money_earned' | 'buildings_count' | 'game_tick' | 'is_locked'
>;

/**
 * Narrow shape for the validate-ticks cron (active players query).
 */
export type ServerGameStateForCron = Pick<
  ServerGameStateRow,
  'user_id' | 'full_state' | 'game_tick' | 'game_speed' | 'last_tick_at' | 'money'
>;

/**
 * Check if the server_game_state client is reachable. Used by callers that
 * want a clean 503 response when Supabase is not configured.
 */
export function isServerGameStateAvailable(): boolean {
  return createServiceRoleClient() !== null;
}

/**
 * Load the lite (non-full_state) game state for a user. Used by GET /api/game/state.
 * Returns null if not found OR if the table is unavailable.
 */
export async function loadServerGameStateLite(
  userId: string
): Promise<ServerGameStateLite | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select(
      'full_state, money, total_money_earned, research_points, buildings, buildings_count, completed_research, resources, workers, game_tick, game_speed, state_hash, state_version, last_tick_at, last_saved_at, cheat_flag_count'
    )
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ServerGameStateLite;
}

/**
 * Load only the fields needed for offline tick computation.
 */
export async function loadServerGameStateForTick(
  userId: string
): Promise<ServerGameStateForTick | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select(
      'full_state, game_tick, game_speed, state_version, last_tick_at, money, is_locked, lock_reason'
    )
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ServerGameStateForTick;
}

/**
 * Load the fields needed for leaderboard submission: total_money_earned, game_tick, is_locked, lock_reason, and money.
 */
export async function loadServerGameStateForLeaderboard(
  userId: string
): Promise<Pick<ServerGameStateRow, 'total_money_earned' | 'game_tick' | 'is_locked' | 'lock_reason' | 'money'> | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select('total_money_earned, game_tick, is_locked, lock_reason, money')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Pick<ServerGameStateRow, 'total_money_earned' | 'game_tick' | 'is_locked' | 'lock_reason' | 'money'>;
}

/**
 * Load only the fields needed for trade (resources + cooldown + version).
 */
export async function loadServerGameStateForTrade(
  userId: string
): Promise<ServerGameStateForTrade | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select('resources, full_state, game_tick, state_version, last_trade_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ServerGameStateForTrade;
}

/**
 * Load only the fields needed for action validation.
 */
export async function loadServerGameStateForAction(
  userId: string
): Promise<ServerGameStateForAction | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select('full_state, money, game_tick, state_version')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ServerGameStateForAction;
}

/**
 * Load only the fields needed for link-identity preview.
 */
export async function loadServerGameStateForPreview(
  userId: string
): Promise<ServerGameStateForPreview | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select('money, total_money_earned, buildings_count, game_tick, is_locked')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as ServerGameStateForPreview | null;
}

/**
 * Load the lock state of a user (used by claim-guest to detect banned
 * guest accounts that are trying to re-claim via a new device).
 */
export async function loadLockState(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('server_game_state')
    .select('is_locked')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return false;
  return data?.is_locked === true;
}

/**
 * Load active players for the validate-ticks cron. Filters by
 * `last_tick_at > cutoffISO`. Returns an array (not a single row).
 */
export async function loadActivePlayersSince(
  cutoffISO: string
): Promise<ServerGameStateForCron[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('server_game_state')
    .select('user_id, full_state, game_tick, game_speed, last_tick_at, money')
    .gt('last_tick_at', cutoffISO)
    .returns<ServerGameStateForCron[]>();

  if (error) throw error;
  return data ?? [];
}

/**
 * Load the fields used by POST /api/game/state for delta validation:
 *   full_state, state_hash, game_tick, cheat_flag_count, state_version,
 *   resources, money, research_points, buildings
 */
export type ServerGameStateForDeltaCheck = Pick<
  ServerGameStateRow,
  | 'full_state'
  | 'state_hash'
  | 'game_tick'
  | 'cheat_flag_count'
  | 'state_version'
  | 'resources'
  | 'money'
  | 'research_points'
  | 'buildings'
>;

export async function loadServerGameStateForDeltaCheck(
  userId: string
): Promise<ServerGameStateForDeltaCheck | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .select(
      'full_state, state_hash, game_tick, cheat_flag_count, state_version, resources, money, research_points, buildings'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as ServerGameStateForDeltaCheck | null;
}

/**
 * Upsert a user's game state. Used by POST /api/game/state.
 * Returns the freshly-inserted/updated row, or null on conflict / failure.
 *
 * NOTE: This is a non-locking write. Callers that need optimistic
 * concurrency should use `saveServerGameStateOptimistic` instead.
 */
export async function saveServerGameState(
  userId: string,
  patch: ServerGameStateUpdate
): Promise<ServerGameStateRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return null;
  return data as ServerGameStateRow;
}

/**
 * Upsert a user's game state. Used by POST /api/game/state when no
 * prior row may exist. Inserts on `user_id` conflict.
 */
export async function upsertServerGameState(
  values: ServerGameStateInsert
): Promise<ServerGameStateRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .upsert(values, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('[serverGameState] upsert error:', error);
    return null;
  }
  return data as ServerGameStateRow;
}

/**
 * Check whether a user already has a game_state row. Used by
 * /api/auth/initialize-guest to short-circuit duplicate initialization.
 * Returns true if a row exists, false otherwise (including on error —
 * callers fall through to the insert path).
 */
export async function hasServerGameState(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('server_game_state')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[serverGameState] hasServerGameState failed:', error.message);
    return false;
  }
  return data !== null;
}

/**
 * Initial-state values for a fresh guest user.
 * Mirrors the constants previously inlined in /api/auth/initialize-guest.
 */
export const INITIAL_GUEST_STATE_VALUES = {
  money: 1000,
  total_money_earned: 1000,
  research_points: 0,
  buildings: [],
  buildings_count: 0,
  completed_research: [],
  resources: {},
  workers: [],
  game_tick: 0,
  game_speed: 1,
  is_locked: false,
  cheat_flag_count: 0,
} as const;

/**
 * Insert the initial game state for a brand-new guest user.
 * Caller must verify no prior state exists (see hasServerGameState).
 */
export async function initializeGuestGameState(
  userId: string,
): Promise<ServerGameStateRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('server_game_state')
    .insert({ user_id: userId, ...INITIAL_GUEST_STATE_VALUES })
    .select()
    .single();
  if (error) {
    console.error('[serverGameState] initializeGuestGameState failed:', error.message);
    return null;
  }
  return data as ServerGameStateRow;
}

/**
 * Read just `game_tick` for a user. Used by /api/auth/migrate-guest to
 * detect "cloud state already exists — refuse migration".
 * Returns null if the user has no row OR the table is unavailable.
 */
export async function getGameTick(userId: string): Promise<number | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('server_game_state')
    .select('game_tick')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[serverGameState] getGameTick failed:', error.message);
    return null;
  }
  return data?.game_tick ?? null;
}

/**
 * Sync `player_progress.game_state` for backwards compatibility. Used
 * by POST /api/game/state (thin: user_id + game_state only).
 */
export async function syncPlayerProgressGameState(
  userId: string,
  gameState: unknown
): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) return;

  await supabase
    .from('player_progress')
    .upsert(
      {
        user_id: userId,
        game_state: gameState as never,
      },
      { onConflict: 'user_id' }
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
  userId: string
): Promise<Record<string, unknown> | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('player_progress')
    .select('game_state')
    .eq('user_id', userId)
    .single();

  if (error || !data?.game_state) return null;
  return data.game_state as Record<string, unknown>;
}

/**
 * Optimistic-locking update: only updates the row if `state_version`
 * still matches `expectedStateVersion`. Used by /api/game/trade to
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
  patch: ServerGameStateUpdate
): Promise<ServerGameStateRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_game_state')
    .update(patch)
    .eq('user_id', userId)
    .eq('state_version', expectedStateVersion)
    .select('*')
    .single();

  if (error || !data) return null;
  return data as ServerGameStateRow;
}

/**
 * Lock a user's account with a given reason. Used by admin actions.
 * Returns true on success, false otherwise.
 */
export async function lockServerGameState(
  userId: string,
  reason: string
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('server_game_state')
    .update({
      is_locked: true,
      lock_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return !error;
}

/**
 * Unlock a user's account. Returns true on success.
 */
export async function unlockServerGameState(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('server_game_state')
    .update({
      is_locked: false,
      lock_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return !error;
}
// ============================================
// Iteration 8 — admin player listing + aggregates
// ============================================

const ADMIN_PLAYER_COLUMNS =
  'user_id, money, total_money_earned, research_points, game_tick, game_speed, buildings_count, cheat_flag_count, is_locked, lock_reason, last_saved_at, created_at';

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
  const supabase = createServiceRoleClient();
  if (!supabase) return { players: [], total: 0 };

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('server_game_state')
    .select(ADMIN_PLAYER_COLUMNS, { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (filters.userIdFilter && filters.userIdFilter.length > 0) {
    query = query.in('user_id', filters.userIdFilter);
  } else if (filters.excludeUuid) {
    query = query.eq('user_id', filters.excludeUuid);
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
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('server_game_state')
    .select(ADMIN_PLAYER_COLUMNS)
    .in('user_id', userIds);
  return (data ?? []) as AdminPlayerRow[];
}

// Aggregate queries for admin dashboard (economy)

export interface MoneyAggregate {
  money: number;
  total_money_earned: number;
}

export async function sumMoneyAcrossAllPlayers(): Promise<{
  totalMoney: number;
  totalEarned: number;
  playerCount: number;
}> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { totalMoney: 0, totalEarned: 0, playerCount: 0 };
  const { data } = await supabase
    .from('server_game_state')
    .select('money, total_money_earned');
  const rows = data ?? [];
  return {
    totalMoney: rows.reduce((s, r) => s + (Number(r.money) || 0), 0),
    totalEarned: rows.reduce((s, r) => s + (Number(r.total_money_earned) || 0), 0),
    playerCount: rows.length,
  };
}

export async function topEarners(limit: number): Promise<AdminPlayerRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('server_game_state')
    .select(ADMIN_PLAYER_COLUMNS)
    .order('total_money_earned', { ascending: false })
    .limit(limit);
  return (data ?? []) as AdminPlayerRow[];
}

export async function countPlayersTotal(): Promise<number> {
  const supabase = createServiceRoleClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('server_game_state')
    .select('user_id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function countLockedPlayers(): Promise<number> {
  const supabase = createServiceRoleClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('server_game_state')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_locked', true);
  return count ?? 0;
}

export async function countActivePlayersSince(sinceISO: string): Promise<number> {
  const supabase = createServiceRoleClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('server_game_state')
    .select('user_id', { count: 'exact', head: true })
    .gte('last_saved_at', sinceISO);
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
  const supabase = createServiceRoleClient();
  if (!supabase) return { successCount: 0, failCount: userIds.length };

  let successCount = 0;
  let failCount = 0;
  for (const userId of userIds) {
    const { error } = await supabase
      .from('server_game_state')
      .update({
        is_locked: isLocked,
        lock_reason: isLocked ? lockReason : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (!error) successCount++;
    else failCount++;
  }
  return { successCount, failCount };
}

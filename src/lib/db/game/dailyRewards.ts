/**
 * db/dailyRewards.ts — Server-authoritative daily reward analytics.
 *
 * Persists claim events to the `daily_rewards` and `user_streaks`
 * tables. These tables are ANALYTICS-ONLY (audit + admin dashboard) —
 * the actual reward state lives in `server_game_state.full_state.loginStreak`,
 * which is the source of truth for gameplay. The action framework
 * (`handleClaimDailyRewardAction`) calls these helpers fire-and-forget
 * after a successful state mutation.
 */

import { createServiceRoleClient } from "@/lib/db/access";

// ─── Types ─────────────────────────────────────────────────────────────

export interface DailyRewardRow {
  id: string;
  user_id: string;
  claim_date: string;
  day_of_streak: number;
  reward_day: number;
  reward_type: string;
  reward_amount: number;
  reward_resource: string | null;
  streak_multiplier: number;
  total_streak: number;
  claimed_at: string;
}

export interface UserStreakRow {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  total_logins: number;
  last_claim_date: string | null;
}

// ─── Inserts / Upserts ─────────────────────────────────────────────────

/**
 * Insert a claim event into `daily_rewards`. Used by the action handler
 * after a successful server-authoritative mutation. Errors are surfaced
 * to the caller (handler treats them as non-blocking via Promise.allSettled).
 */
export async function recordDailyRewardClaim(args: {
  userId: string;
  claimDate: string; // YYYY-MM-DD
  dayOfStreak: number;
  rewardDay: number;
  rewardType: string;
  rewardAmount: number;
  rewardResource: string | null;
  streakMultiplier: number;
  totalStreak: number;
}): Promise<DailyRewardRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("daily_rewards")
    .insert({
      user_id: args.userId,
      claim_date: args.claimDate,
      day_of_streak: args.dayOfStreak,
      reward_day: args.rewardDay,
      reward_type: args.rewardType,
      reward_amount: args.rewardAmount,
      reward_resource: args.rewardResource,
      streak_multiplier: args.streakMultiplier,
      total_streak: args.totalStreak,
    })
    .select(
      "id,user_id,claim_date,day_of_streak,reward_day,reward_type,reward_amount,reward_resource,streak_multiplier,total_streak,claimed_at",
    )
    .single();

  if (error || !data) {
    console.error("[DailyRewards] insert failed:", error);
    return null;
  }
  return data;
}

/**
 * Upsert user_streaks aggregate. Errors are surfaced to the caller
 * (handler treats them as non-blocking via Promise.allSettled).
 */
export async function upsertUserStreakFromClaim(args: {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  totalLogins: number;
  lastClaimDate: string;
}): Promise<UserStreakRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .rpc("upsert_user_streak", {
      p_user_id: args.userId,
      p_current_streak: args.currentStreak,
      p_longest_streak: args.longestStreak,
      p_total_logins: args.totalLogins,
      p_last_claim_date: args.lastClaimDate,
    });

  if (error || !data) {
    console.error("[DailyRewards] upsert_user_streak failed:", error);
    return null;
  }
  return data;
}
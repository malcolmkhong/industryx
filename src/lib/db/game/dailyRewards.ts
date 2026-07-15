/**
 * db/dailyRewards.ts — Server-authoritative daily reward tracking.
 *
 * Centralized access to the `daily_rewards` and `user_streaks` tables.
 * All API routes must import from here instead of touching the tables directly.
 */

import { createServiceRoleClient } from '@/lib/db/access';;

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

// ─── Queries ───────────────────────────────────────────────────────────

/**
 * Get the last claim date for a user.
 */
export async function getLastClaimDate(userId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('daily_rewards')
    .select('claim_date')
    .eq('user_id', userId)
    .order('claim_date', { ascending: false })
    .limit(1)
    .single();

  return data?.claim_date ?? null;
}

/**
 * Get user streak data.
 */
export async function getUserStreak(userId: string): Promise<UserStreakRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .single();

  return data;
}

/**
 * Record a daily reward claim and upsert streak in a single call.
 * Returns the created reward row and updated streak.
 */
export async function claimDailyReward(
  userId: string,
  streakData: {
    currentStreak: number;
    longestStreak: number;
    totalLogins: number;
    lastClaimDate: string;
  },
  reward: {
    rewardDay: number;
    rewardType: string;
    rewardAmount: number;
    rewardResource: string | null;
    streakMultiplier: number;
  },
): Promise<{ reward: DailyRewardRow; streak: UserStreakRow } | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  // 1. Insert reward row
  const { data: rewardRow, error: rewardError } = await supabase
    .from('daily_rewards')
    .insert({
      user_id: userId,
      claim_date: streakData.lastClaimDate,
      day_of_streak: streakData.currentStreak,
      reward_day: reward.rewardDay,
      reward_type: reward.rewardType,
      reward_amount: reward.rewardAmount,
      reward_resource: reward.rewardResource,
      streak_multiplier: reward.streakMultiplier,
      total_streak: streakData.currentStreak,
    })
    .select('*')
    .single();

  if (rewardError || !rewardRow) {
    console.error('[DailyRewards] Failed to insert reward:', rewardError);
    return null;
  }

  // 2. Upsert streak
  const { data: streakRow, error: streakError } = await supabase
    .rpc('upsert_user_streak', {
      p_user_id: userId,
      p_current_streak: streakData.currentStreak,
      p_longest_streak: streakData.longestStreak,
      p_total_logins: streakData.totalLogins,
      p_last_claim_date: streakData.lastClaimDate,
    });

  if (streakError || !streakRow) {
    console.error('[DailyRewards] Failed to upsert streak:', streakError);
    // Reward was inserted — still return it, just warn
  }

  return {
    reward: rewardRow,
    streak: streakRow ?? await getUserStreak(userId) as unknown as UserStreakRow,
  };
}

/**
 * Get recent reward history for a user.
 */
export async function getRecentRewards(userId: string, limit = 10): Promise<DailyRewardRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('daily_rewards')
    .select('*')
    .eq('user_id', userId)
    .order('claimed_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}

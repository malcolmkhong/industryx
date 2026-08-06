import { validateClaimDailyReward } from "@/lib/game/production/engine/validators/rewards";
import { applyClaimDailyRewardMutation } from "@/lib/game/production/engine/mutators/rewards";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";
import { createServiceRoleClient } from "@/lib/db/access";
import { getCurrentUtcDateISO } from "@/lib/auth/serverTime";
import {
  getStreakMultiplier,
  WEEKLY_DAILY_REWARDS,
} from "@/lib/game/config/configCache";
import {
  recordDailyRewardClaim,
  upsertUserStreakFromClaim,
} from "@/lib/db/game/dailyRewards";

/**
 * Server-authoritative daily reward claim handler.
 *
 * Server-time-anchored (BUG-074): reads `now_iso()` from Postgres so the
 * day boundary matches the tick chain regardless of the host container's
 * `TZ` env var. The validator only checks invariants; mutation is
 * performed here with the server-computed `multiplier` so client-sent
 * `weeklyRewards[].amount` cannot be tampered with.
 *
 * Async because the handler calls now_iso() via service-role client.
 */
export async function handleClaimDailyRewardAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  userId: string,
): Promise<ActionResponse> {
  const day = payload.day as number;
  if (typeof day !== "number") {
    return { valid: false, error: "Missing 'day' number in payload" };
  }

  // 1. Authoritative UTC date from Postgres (per BUG-074).
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      valid: false,
      error: "Service role client unavailable",
      code: "SERVER_UNAVAILABLE",
    };
  }
  const serverToday = await getCurrentUtcDateISO(supabase);
  if (serverToday == null) {
    return {
      valid: false,
      error: "Server time unavailable — refusing to claim daily reward",
      code: "SERVER_TIME_UNAVAILABLE",
    };
  }

  // 2. Validate invariants (read-only).
  const validation = validateClaimDailyReward(day, gameState);
  if (!validation.ok) {
    return { valid: false, error: validation.error };
  }

  // 3. Apply server-authoritative amount + multiplier.
  const template = WEEKLY_DAILY_REWARDS.find((r) => r.day === day);
  if (!template) {
    return {
      valid: false,
      error: `No reward template configured for day ${day}`,
    };
  }

  const currentStreak = gameState.loginStreak?.currentStreak ?? 0;
  const multiplier = getStreakMultiplier(currentStreak);

  const corrected = applyClaimDailyRewardMutation(
    {
      day,
      rewardIdx: validation.rewardIdx,
      rewardResource: template.resource ?? null,
      claimDate: serverToday,
      multiplier,
      // Use the template's amount, NOT the client-sent amount — the
      // validator only checked that the reward slot is unclaimed, but
      // the actual payout must come from the server-authoritative
      // template. This means a tampered `weeklyRewards[i].amount`
      // cannot inflate the reward.
      rewardAmountOverride: template.amount,
    },
    gameState,
  );

  // 4. Fire-and-forget: persist the analytics row + streak upsert to
  // the `daily_rewards` and `user_streaks` tables so the admin /
  // /admin/bootstrap-audit dashboard sees real data. The action
  // response is independent of these writes — a write failure logs
  // but does not block the user from claiming.
  const finalAmount = Math.floor(template.amount * multiplier);
  const rewardTypeStr = template.type;
  const newTotalLogins = (gameState.loginStreak?.totalLogins ?? 0) + 1;
  const newCurrentStreak = (() => {
    const existing = gameState.loginStreak;
    if (!existing) return 1;
    // Server-computed streak rollover: if lastLoginDate was yesterday
    // (UTC), bump streak; otherwise reset to 1.
    const yesterday = (() => {
      const ts = Date.UTC(
        Number(serverToday.slice(0, 4)),
        Number(serverToday.slice(5, 7)) - 1,
        Number(serverToday.slice(8, 10)),
      );
      return new Date(ts - 86_400_000).toISOString().slice(0, 10);
    })();
    if (existing.lastLoginDate === yesterday) return existing.currentStreak + 1;
    return 1;
  })();
  const newLongestStreak = Math.max(
    gameState.loginStreak?.longestStreak ?? 0,
    newCurrentStreak,
  );

  void Promise.allSettled([
    recordDailyRewardClaim({
      userId,
      claimDate: serverToday,
      dayOfStreak: newCurrentStreak,
      rewardDay: day,
      rewardType: rewardTypeStr,
      rewardAmount: finalAmount,
      rewardResource: template.resource ?? null,
      streakMultiplier: multiplier,
      totalStreak: newCurrentStreak,
    }),
    upsertUserStreakFromClaim({
      userId,
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      totalLogins: newTotalLogins,
      lastClaimDate: serverToday,
    }),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(
          "[DailyRewardAPI] analytics write failed (non-blocking):",
          r.reason,
        );
      }
    }
  });

  return { valid: true, correctedState: corrected };
}

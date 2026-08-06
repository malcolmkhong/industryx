// Server-authoritative daily reward claim mutation.
//
// Assumes validator verified: day in [1,7], weeklyRewards has unclaimed entry
// for that day.
//
// The amount is NOT taken from the (possibly client-tampered)
// `weeklyRewards[i].amount`. The caller must pass a server-authoritative
// `rewardAmountOverride` (typically `WEEKLY_DAILY_REWARDS[day].amount`).
// This prevents the client from inflating the payout by editing their
// store.

import type { ServerGameData } from "../../../shared/types/types";

export interface ClaimDailyRewardMutationInput {
  day: number;
  rewardIdx: number;
  rewardResource: string | null;
  // Server-anchored UTC date (YYYY-MM-DD) — the source of truth for
  // when this claim happened. Recorded into `loginStreak.lastLoginDate`
  // so subsequent client reads agree with server time.
  claimDate: string;
  multiplier: number;
  rewardAmountOverride: number;
}

export function applyClaimDailyRewardMutation(
  input: ClaimDailyRewardMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const {
    day,
    rewardIdx,
    rewardResource,
    claimDate,
    multiplier,
    rewardAmountOverride,
  } = input;
  const weeklyRewards = state.loginStreak?.weeklyRewards ?? [];
  const reward = weeklyRewards[rewardIdx];

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;
  const corpPoints = state.prestigeState?.corporationPoints ?? 0;
  const resources = state.resources ?? {};

  // Apply streak multiplier to the server-authoritative amount.
  const rewardAmount = Math.floor(rewardAmountOverride * multiplier);

  // Mark the reward as claimed.
  const updatedWeeklyRewards = weeklyRewards.map((r, i) =>
    i === rewardIdx ? { ...r, claimed: true } : r,
  );

  const nextLoginStreak = {
    ...(state.loginStreak ?? {
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: "",
      totalLogins: 0,
    }),
    // Server-time-anchored lastLoginDate so the day boundary matches
    // what the next claim sees from now_iso().
    lastLoginDate: claimDate,
    weeklyRewards: updatedWeeklyRewards,
  };

  const corrected: Record<string, unknown> = {
    loginStreak: nextLoginStreak,
  };

  // Use the (validator-verified) reward.type but ignore reward.amount
  // entirely — `rewardAmountOverride` is the source of truth.
  const rewardType = reward?.type;
  switch (rewardType) {
    case "money":
      corrected.money = money + rewardAmount;
      corrected.totalMoneyEarned = totalMoneyEarned + rewardAmount;
      break;
    case "researchPoints":
      corrected.researchPoints = researchPoints + rewardAmount;
      break;
    case "resources": {
      const newResources = { ...resources };
      if (!rewardResource) {
        // Programmer error — handler should have passed a real
        // resource. Fail-closed: drop the resource grant rather than
        // silently skip (would otherwise silently lose the reward).
        break;
      }
      newResources[rewardResource] =
        (newResources[rewardResource] ?? 0) + rewardAmount;
      corrected.resources = newResources;
      break;
    }
    case "corporationPoints":
      corrected.prestigeState = {
        totalPrestiges: state.prestigeState?.totalPrestiges ?? 0,
        megaFactoryUnlocked: state.prestigeState?.megaFactoryUnlocked ?? false,
        bonuses: state.prestigeState?.bonuses ?? [],
        corporationPoints: corpPoints + rewardAmount,
      };
      // Day 7 grants $2000 bonus on top of corpPoints.
      if (day === 7) {
        corrected.money = money + 2000;
        corrected.totalMoneyEarned = totalMoneyEarned + 2000;
      }
      break;
    default:
      // Unknown reward type — fail-closed by mutating nothing.
      break;
  }

  return corrected as Partial<ServerGameData>;
}

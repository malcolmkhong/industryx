// Server-authoritative daily reward claim mutation.
//
// Assumes validator verified: day in [1,7], weeklyRewards has unclaimed entry
// for that day, amount is finite non-negative, resources reward has resource
// field if type === "resources".

import type { ServerGameData } from "../../../shared/types/types";

export interface ClaimDailyRewardMutationInput {
  day: number;
  rewardIdx: number;
  rewardResource: string | null;
}

export function applyClaimDailyRewardMutation(
  input: ClaimDailyRewardMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { day, rewardIdx, rewardResource } = input;
  const weeklyRewards = state.loginStreak?.weeklyRewards ?? [];
  const reward = weeklyRewards[rewardIdx];

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;
  const corpPoints = state.prestigeState?.corporationPoints ?? 0;
  const resources = state.resources ?? {};

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
    weeklyRewards: updatedWeeklyRewards,
  };

  const corrected: Record<string, unknown> = {
    loginStreak: nextLoginStreak,
  };

  switch (reward.type) {
    case "money":
      corrected.money = money + reward.amount;
      corrected.totalMoneyEarned = totalMoneyEarned + reward.amount;
      break;
    case "researchPoints":
      corrected.researchPoints = researchPoints + reward.amount;
      break;
    case "resources": {
      const newResources = { ...resources };
      // Validator must have ensured reward.resource is set.
      if (!rewardResource) {
        // Programmer error — validator should have rejected. Fail-closed:
        // drop the resource grant rather than silently skip.
        break;
      }
      newResources[rewardResource] =
        (newResources[rewardResource] ?? 0) + reward.amount;
      corrected.resources = newResources;
      break;
    }
    case "corporationPoints":
      corrected.prestigeState = {
        totalPrestiges: state.prestigeState?.totalPrestiges ?? 0,
        megaFactoryUnlocked: state.prestigeState?.megaFactoryUnlocked ?? false,
        bonuses: state.prestigeState?.bonuses ?? [],
        corporationPoints: corpPoints + reward.amount,
      };
      // Day 7 grants $2000 bonus on top of corpPoints.
      if (day === 7) {
        corrected.money = money + 2000;
        corrected.totalMoneyEarned = totalMoneyEarned + 2000;
      }
      break;
  }

  return corrected as Partial<ServerGameData>;
}
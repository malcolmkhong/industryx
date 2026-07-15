// Server-authoritative daily reward claim validator.

import { applyClaimDailyRewardMutation } from "../mutators/rewards";
import type { ServerGameData } from "../../../shared/types/types";

export function validateClaimDailyRewardAction(
  day: number,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return { valid: false, error: "Day must be an integer between 1 and 7" };
  }

  const weeklyRewards = state.loginStreak?.weeklyRewards ?? [];
  const rewardIdx = weeklyRewards.findIndex((r) => r.day === day);
  if (rewardIdx < 0) {
    return {
      valid: false,
      error: `No daily reward configured for day ${day}`,
    };
  }
  const reward = weeklyRewards[rewardIdx];
  if (reward.claimed) {
    return {
      valid: false,
      error: `Daily reward for day ${day} already claimed`,
    };
  }
  if (typeof reward.amount !== "number" || reward.amount < 0) {
    return {
      valid: false,
      error: `Invalid reward amount for day ${day}`,
    };
  }

  // Validate resources reward has resource field if type is resources.
  if (reward.type === "resources" && !reward.resource) {
    return {
      valid: false,
      error: `Resources reward for day ${day} missing resource field`,
    };
  }

  // Reject unknown reward types.
  if (
    reward.type !== "money" &&
    reward.type !== "researchPoints" &&
    reward.type !== "resources" &&
    reward.type !== "corporationPoints"
  ) {
    return {
      valid: false,
      error: `Unknown reward type "${reward.type}" for day ${day}`,
    };
  }

  return {
    valid: true,
    correctedState: applyClaimDailyRewardMutation(
      { day, rewardIdx, rewardResource: reward.resource ?? null },
      state,
    ),
  };
}
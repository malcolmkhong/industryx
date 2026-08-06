// Server-authoritative daily reward claim validator (read-only).
//
// Validates that the requested day is claimable given the current
// game state. Does NOT mutate state — the handler is responsible for
// applying the server-authoritative amount + multiplier via the
// mutator.

import type { ServerGameData } from "../../../shared/types/types";

export interface ClaimDailyRewardValidationOk {
  ok: true;
  rewardIdx: number;
}
export interface ClaimDailyRewardValidationFail {
  ok: false;
  error: string;
}

export function validateClaimDailyReward(
  day: number,
  state: Partial<ServerGameData>,
): ClaimDailyRewardValidationOk | ClaimDailyRewardValidationFail {
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return { ok: false, error: "Day must be an integer between 1 and 7" };
  }

  const weeklyRewards = state.loginStreak?.weeklyRewards ?? [];
  const rewardIdx = weeklyRewards.findIndex((r) => r.day === day);
  if (rewardIdx < 0) {
    return {
      ok: false,
      error: `No daily reward configured for day ${day}`,
    };
  }

  const reward = weeklyRewards[rewardIdx];
  if (reward.claimed) {
    return {
      ok: false,
      error: `Daily reward for day ${day} already claimed`,
    };
  }

  // Validator does NOT enforce `reward.amount` (the handler trusts the
  // server-authoritative `WEEKLY_DAILY_REWARDS` template instead). A
  // tampered `weeklyRewards[i].amount` cannot inflate the payout
  // because the handler uses `template.amount`, not `reward.amount`.

  return { ok: true, rewardIdx };
}

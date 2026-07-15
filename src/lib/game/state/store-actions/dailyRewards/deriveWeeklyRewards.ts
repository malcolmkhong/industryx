import type { DailyReward } from "../../../shared/types/types";
import { WEEKLY_DAILY_REWARDS } from "../../../config/configCache";

export function deriveWeeklyRewards(
  multiplier: number,
  currentDay: number,
  markPastClaimed: boolean,
): DailyReward[] {
  return WEEKLY_DAILY_REWARDS.map((r) => ({
    ...r,
    amount: Math.floor(r.amount * multiplier),
    claimed: markPastClaimed ? r.day < currentDay : false,
  }));
}

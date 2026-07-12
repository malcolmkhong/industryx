// ============================================
// Daily Rewards Actions Factory
// ============================================
import type { ServerGameData } from "../../shared/types/types";
import { getStreakMultiplier } from "../../config/configCache";
import { soundEngine } from "../../audio/soundEngine";
import { generateId } from "../../shared/utils/generateId";
import type { SetFn, GetFn } from "./_actionTypes";

export function createDailyRewardActions(set: SetFn, get: GetFn) {
  return {
    checkDailyLogin: () => {
      const state = get();
      const today = new Date().toISOString().split("T")[0];
      const loginStreak = { ...state.loginStreak };

      if (loginStreak.lastLoginDate === today) return;

      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];

      if (loginStreak.lastLoginDate === yesterday) {
        loginStreak.currentStreak++;
      } else if (loginStreak.lastLoginDate === "") {
        loginStreak.currentStreak = 1;
      } else {
        loginStreak.currentStreak = 1;
      }

      loginStreak.lastLoginDate = today;
      loginStreak.totalLogins++;

      if (loginStreak.currentStreak > loginStreak.longestStreak) {
        loginStreak.longestStreak = loginStreak.currentStreak;
      }

      const dayOfWeek = ((loginStreak.currentStreak - 1) % 7) + 1;

      const needsNewRewards =
        loginStreak.weeklyRewards.length === 0 ||
        loginStreak.weeklyRewards.every((r) => r.claimed);

      if (needsNewRewards) {
        const multiplier = getStreakMultiplier(loginStreak.currentStreak);
        loginStreak.weeklyRewards = deriveWeeklyRewards(multiplier, dayOfWeek, false);
      }

      const todayReward = loginStreak.weeklyRewards.find(
        (r) => r.day === dayOfWeek && !r.claimed,
      );
      if (!todayReward) {
        const multiplier = getStreakMultiplier(loginStreak.currentStreak);
        loginStreak.weeklyRewards = deriveWeeklyRewards(multiplier, dayOfWeek, true);
      }

      set({ loginStreak });
    },

    claimDailyReward: async (day: number) => {
      const state = get();
      const rewardIndex = state.loginStreak.weeklyRewards.findIndex(
        (r: any) => r.day === day && !r.claimed,
      );
      if (rewardIndex === -1) return;

      const validation = await import("../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer("claim_daily_reward", { day }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "building");
        (get() as any).addNotification?.(
          "error",
          validation.error ?? "Daily reward claim rejected by server",
        );
        return;
      }

      const corrected = validation.correctedState;
      if (!corrected?.loginStreak) {
        soundEngine.play("error", "building");
        (get() as any).addNotification?.(
          "error",
          "Daily reward could not be confirmed by server. Please retry.",
        );
        return;
      }

      const updates: Partial<ServerGameData> = {};

      updates.loginStreak = corrected.loginStreak;
      if (corrected?.money !== undefined) {
        updates.money = corrected.money;
      }
      if (corrected?.totalMoneyEarned !== undefined) {
        updates.totalMoneyEarned = corrected.totalMoneyEarned;
      }
      if (corrected?.researchPoints !== undefined) {
        updates.researchPoints = corrected.researchPoints;
      }
      if (corrected?.resources) {
        updates.resources = corrected.resources;
      }
      if (corrected?.prestigeState) {
        updates.prestigeState = corrected.prestigeState;
      }

      set(updates);
      soundEngine.play("moneyEarned", "building");
      (get() as any).addNotification?.("success", `Claimed daily reward: Day ${day}!`);
    },
  };
}

function deriveWeeklyRewards(multiplier: number, currentDay: number, markPastClaimed: boolean) {
  return (WEEKLY_DAILY_REWARDS as any[]).map((r: any) => ({
    ...r,
    amount: Math.floor(r.amount * multiplier),
    claimed: markPastClaimed ? r.day < currentDay : false,
  }));
}

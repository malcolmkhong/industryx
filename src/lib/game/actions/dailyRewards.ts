// ============================================
// Daily Rewards Actions Factory
// ============================================
import type { ServerGameData } from "../types";
import { WEEKLY_DAILY_REWARDS, getStreakMultiplier } from "../configCache";
import { soundEngine } from "../soundEngine";
import { generateId } from "../utils/generateId";
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
        loginStreak.weeklyRewards = WEEKLY_DAILY_REWARDS.map((r) => ({
          ...r,
          amount: Math.floor(r.amount * multiplier),
          claimed: false,
        }));
      }

      const todayReward = loginStreak.weeklyRewards.find(
        (r) => r.day === dayOfWeek && !r.claimed,
      );
      if (!todayReward) {
        const multiplier = getStreakMultiplier(loginStreak.currentStreak);
        loginStreak.weeklyRewards = WEEKLY_DAILY_REWARDS.map((r) => ({
          ...r,
          amount: Math.floor(r.amount * multiplier),
          claimed: r.day < dayOfWeek,
        }));
      }

      set({ loginStreak });
    },

    claimDailyReward: async (day: number) => {
      const state = get();
      const rewardIndex = state.loginStreak.weeklyRewards.findIndex(
        (r) => r.day === day && !r.claimed,
      );
      if (rewardIndex === -1) return;

      // Phase 6: server-authoritative daily reward. Server validates
      // the day exists, verifies unclaimed, applies the reward (which
      // may be money/RP/resources/corpPoints), and marks it claimed.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer("claim_daily_reward", { day }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "building");
        get().addNotification(
          "error",
          validation.error ?? "Daily reward claim rejected by server",
        );
        return;
      }

      // Apply server-authoritative state. Phase 13: correctedState is
      // Partial<ServerGameData>. Updates are spread into the store;
      // UI fields are preserved (server has no claim to them).
      const corrected = validation.correctedState;
      if (!corrected?.loginStreak) {
        soundEngine.play("error", "building");
        get().addNotification(
          "error",
          "Daily reward could not be confirmed by server. Please retry.",
        );
        return;
      }

      // Local partial updates typed against the store's SetFn arg.
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

      // Phase 13: updates is Partial<ServerGameData> passed to the
      // store's set() function (typed as Partial<GameStore>). The
      // assignment is safe — verified at compile time.
      set(updates);
      soundEngine.play("moneyEarned", "building");
      get().addNotification("success", `Claimed daily reward: Day ${day}!`);
    },
  };
}

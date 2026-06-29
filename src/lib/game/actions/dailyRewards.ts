// ============================================
// Daily Rewards Actions Factory
// ============================================
import type { GameState, ResourceType } from '../types';
import { WEEKLY_DAILY_REWARDS, getStreakMultiplier } from '../configCache';
import { getCapacity } from '../utils/costCalculator';
import { soundEngine } from '../soundEngine';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createDailyRewardActions(set: SetFn, get: GetFn) {
  return {
    checkDailyLogin: () => {
      const state = get();
      const today = new Date().toISOString().split('T')[0];
      const loginStreak = { ...state.loginStreak };

      if (loginStreak.lastLoginDate === today) return;

      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      if (loginStreak.lastLoginDate === yesterday) {
        loginStreak.currentStreak++;
      } else if (loginStreak.lastLoginDate === '') {
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

      const needsNewRewards = loginStreak.weeklyRewards.length === 0 ||
        loginStreak.weeklyRewards.every((r: any) => r.claimed);

      if (needsNewRewards) {
        const multiplier = getStreakMultiplier(loginStreak.currentStreak);
        loginStreak.weeklyRewards = WEEKLY_DAILY_REWARDS.map((r: any) => ({
          ...r,
          amount: Math.floor(r.amount * multiplier),
          claimed: false,
        }));
      }

      const todayReward = loginStreak.weeklyRewards.find((r: any) => r.day === dayOfWeek && !r.claimed);
      if (!todayReward) {
        const multiplier = getStreakMultiplier(loginStreak.currentStreak);
        loginStreak.weeklyRewards = WEEKLY_DAILY_REWARDS.map((r: any) => ({
          ...r,
          amount: Math.floor(r.amount * multiplier),
          claimed: r.day < dayOfWeek,
        }));
      }

      set({ loginStreak });
    },

    claimDailyReward: (day: number) => {
      const state = get();
      const loginStreak = { ...state.loginStreak, weeklyRewards: [...state.loginStreak.weeklyRewards] };
      const rewardIndex = loginStreak.weeklyRewards.findIndex((r: any) => r.day === day && !r.claimed);
      if (rewardIndex === -1) return;

      const reward = loginStreak.weeklyRewards[rewardIndex];
      loginStreak.weeklyRewards[rewardIndex] = { ...reward, claimed: true };

      const updates: Record<string, unknown> = { loginStreak };

      switch (reward.type) {
        case 'money':
          updates.money = state.money + reward.amount;
          updates.totalMoneyEarned = state.totalMoneyEarned + reward.amount;
          break;
        case 'researchPoints':
          updates.researchPoints = state.researchPoints + reward.amount;
          break;
        case 'resources':
          if (reward.resource) {
            const res = reward.resource as ResourceType;
            const newResources = { ...state.resources };
            newResources[res] = Math.min(getCapacity(state, res), newResources[res] + reward.amount);
            updates.resources = newResources;
          }
          break;
        case 'corporationPoints':
          updates.prestigeState = {
            ...state.prestigeState,
            corporationPoints: state.prestigeState.corporationPoints + reward.amount,
          };
          if (day === 7) {
            updates.money = (updates.money as number ?? state.money) + 2000;
            updates.totalMoneyEarned = (updates.totalMoneyEarned as number ?? state.totalMoneyEarned) + 2000;
          }
          break;
      }

      set(updates);
      soundEngine.play('moneyEarned', 'building');
      get().addNotification('success', `Claimed daily reward: Day ${day}!`);
    },
  };
}

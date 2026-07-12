// ============================================
// Leaderboard Actions Factory
// ============================================
import type { LeaderboardEntry } from '../../shared/types/types';
import type { SetFn, GetFn } from "./_actionTypes";

export function createLeaderboardActions(set: SetFn, get: GetFn) {
  return {
    addLeaderboardEntry: (entry: LeaderboardEntry) => {
      const state = get();
      const updatedEntries = [...state.leaderboardEntries, entry]
        .sort((a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score)
        .slice(0, 10)
        .map((e: LeaderboardEntry, i: number) => ({ ...e, rank: i + 1 }));
      set({ leaderboardEntries: updatedEntries });
    },
  };
}

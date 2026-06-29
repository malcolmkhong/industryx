// ============================================
// Leaderboard Actions Factory
// ============================================
import type { LeaderboardEntry } from '../types';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

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

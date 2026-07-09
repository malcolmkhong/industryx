// ============================================
// Rank Actions Factory
// ============================================
import { BUILDING_DEFS, RANK_THRESHOLDS } from "../configCache";
import { MAX_TIER } from "../tiers";
import type { SetFn, GetFn } from "./_actionTypes";

export function createRankActions(set: SetFn, get: GetFn) {
  return {
    getCurrentRank: () => {
      const state = get();
      const score = Math.floor(
        state.totalMoneyEarned +
          state.buildings.length * 100 +
          state.completedResearch.length * 200 +
          state.stats.contractsCompleted * 50 +
          state.prestigeState.totalPrestiges * 500,
      );

      let currentRank = RANK_THRESHOLDS[0];
      let nextRank = RANK_THRESHOLDS[1] ?? null;
      for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
        if (score >= RANK_THRESHOLDS[i].minScore) {
          currentRank = RANK_THRESHOLDS[i];
          nextRank = RANK_THRESHOLDS[i + 1] ?? null;
          break;
        }
      }

      const progress = nextRank
        ? (score - currentRank.minScore) /
          (nextRank.minScore - currentRank.minScore)
        : 1;

      return {
        name: currentRank.name,
        icon: currentRank.icon,
        color: currentRank.color,
        score,
        nextRankScore: nextRank ? nextRank.minScore : null,
        progress: Math.min(1, Math.max(0, progress)),
      };
    },

    getPlayerGameTier: () => {
      const state = get();
      if (state.buildings.length === 0) return 0;
      const highestBuildingTier = Math.max(
        0,
        ...state.buildings.map((b: any) => BUILDING_DEFS[b.type]?.tier ?? 0),
      );
      const researchTier = Math.floor(state.completedResearch.length / 3);
      return Math.min(MAX_TIER, Math.max(highestBuildingTier, researchTier));
    },
  };
}

import { RANK_THRESHOLDS } from "../../../config/configCache";
import type { GetFn } from "../_actionTypes";

const FALLBACK_RANK = {
  name: "Apprentice",
  minScore: 0,
  icon: "game-icons:medal",
  color: "#a0a0a0",
};

type RankThreshold = typeof FALLBACK_RANK;

function isRankThreshold(rank: unknown): rank is RankThreshold {
  return (
    Boolean(rank) &&
    typeof (rank as RankThreshold).name === "string" &&
    typeof (rank as RankThreshold).minScore === "number" &&
    Number.isFinite((rank as RankThreshold).minScore) &&
    typeof (rank as RankThreshold).icon === "string" &&
    typeof (rank as RankThreshold).color === "string"
  );
}

function buildRankResult(
  currentRank: RankThreshold | undefined,
  nextRank: RankThreshold | null | undefined,
  score: number,
) {
  const safeCurrentRank = isRankThreshold(currentRank) ? currentRank : FALLBACK_RANK;
  const safeNextRank = isRankThreshold(nextRank) ? nextRank : null;
  const safeScore = Number.isFinite(score) ? score : 0;

  const progress = safeNextRank
    ? (safeScore - safeCurrentRank.minScore) / (safeNextRank.minScore - safeCurrentRank.minScore)
    : 1;

  return {
    name: safeCurrentRank?.name ?? FALLBACK_RANK.name,
    icon: safeCurrentRank?.icon ?? FALLBACK_RANK.icon,
    color: safeCurrentRank?.color ?? FALLBACK_RANK.color,
    score: safeScore,
    nextRankScore: safeNextRank?.minScore ?? null,
    progress: Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1)),
  };
}

function getRankThresholds(): RankThreshold[] {
  const thresholds = Array.isArray(RANK_THRESHOLDS) ? RANK_THRESHOLDS : [];
  const validThresholds = thresholds.filter(isRankThreshold);

  return validThresholds.length > 0 ? validThresholds : [FALLBACK_RANK];
}

export function getCurrentRankState(get?: GetFn) {
  if (typeof get !== "function") {
    return buildRankResult(FALLBACK_RANK, null, 0);
  }

  const state = get();
  if (!state) {
    return buildRankResult(FALLBACK_RANK, null, 0);
  }

  const score = Math.floor(
    (state.totalMoneyEarned ?? 0) +
      (state.buildings?.length ?? 0) * 100 +
      (state.completedResearch?.length ?? 0) * 200 +
      (state.stats?.contractsCompleted ?? 0) * 50 +
      (state.prestigeState?.totalPrestiges ?? 0) * 500,
  );

  const rankThresholds = getRankThresholds();
  let currentRank = rankThresholds[0];
  let nextRank = rankThresholds[1] ?? null;
  for (let i = rankThresholds.length - 1; i >= 0; i--) {
    if (score >= rankThresholds[i].minScore) {
      currentRank = rankThresholds[i];
      nextRank = rankThresholds[i + 1] ?? null;
      break;
    }
  }

  return buildRankResult(currentRank, nextRank, score);
}

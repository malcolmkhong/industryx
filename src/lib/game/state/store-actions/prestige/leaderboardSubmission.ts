// leaderboardSubmission: fire-and-forget leaderboard POST after prestige.
// Extracted from the original inline queueMicrotask block in prestige.ts.
// The caller is responsible for wrapping in queueMicrotask so the UI
// doesn't wait on network.

import { formatNumber } from "../../../shared/utils/formatNumber";

export interface PrestigeLeaderboardInput {
  corporationName: string;
  score: number;
  rankName: string;
  state: Readonly<{
    totalMoneyEarned: number;
    money: number;
    gameTick: number;
    gameSpeed: number;
    buildings: unknown[];
    researchPoints: number;
    completedResearch: string[];
    prestigeState: unknown;
    stats: { factoriesBuilt: number; contractsCompleted: number; playTime: number };
  }>;
  finalPrestigeCount: number;
  addSuccessNotification: (msg: string) => void;
}

export async function submitPrestigeLeaderboard(
  input: PrestigeLeaderboardInput,
): Promise<void> {
  const {
    corporationName,
    score,
    rankName,
    state,
    finalPrestigeCount,
    addSuccessNotification,
  } = input;

  try {
    // Get the current Supabase session token
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return;
    }

    const response = await fetch("/api/game/leaderboard/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        corporationName,
        score,
        totalMoneyEarned: state.totalMoneyEarned,
        buildingsBuilt: state.stats.factoriesBuilt,
        researchCompleted: state.completedResearch.length,
        contractsCompleted: state.stats.contractsCompleted,
        prestigeCount: finalPrestigeCount,
        playTimeTicks: state.stats.playTime,
        rankName,
        gameTick: state.gameTick,
        gameState: {
          money: state.money,
          totalMoneyEarned: state.totalMoneyEarned,
          gameTick: state.gameTick,
          buildings: state.buildings,
          researchPoints: state.researchPoints,
          completedResearch: state.completedResearch,
          prestigeState: state.prestigeState,
          stats: state.stats,
          gameSpeed: state.gameSpeed,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.rank) {
        addSuccessNotification(
          `Score submitted! Rank #${data.rank.bestRank} — ${formatNumber(score)} pts`,
        );
      }
    } else {
      const data = await response.json().catch(() => ({}));
      console.warn(
        "[Prestige] Leaderboard submission failed:",
        data.error,
      );
    }
  } catch (err) {
    console.warn("[Prestige] Leaderboard submission error:", err);
  }
}

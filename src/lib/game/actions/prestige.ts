import { RANK_THRESHOLDS } from "../configCache";
import { getBalance } from "../balanceConfig";
import { soundEngine } from "../soundEngine";
import { createInitialState } from "../constants/initialState";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { friendlyActionError } from "../utils/friendlyErrors";

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

export function createPrestigeActions(set: SetFn, get: GetFn) {
  return {
    doPrestige: async () => {
      const state = get();
      if (state.buildings.length < 5) {
        get().addNotification(
          "error",
          "Need at least 5 buildings to Global Expand!",
        );
        return;
      }

      // Phase 6: server-authoritative prestige. Server validates minimum
      // buildings, computes Corporation Points (CP) earned, and returns
      // the authoritative post-prestige state. The state RESET itself
      // (clearing buildings, resources, money) is deterministic from
      // createInitialState() and applied client-side; only the CP and
      // totalPrestiges counters are server-authoritative (anti-cheat).
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer("do_prestige", {}, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        // eslint-disable-next-line no-console
        console.error(`[doPrestige] server rejected: ${validation.error}`);
        get().addNotification("error", friendlyActionError(validation.error));
        return;
      }

      // Apply server-authoritative prestigeState. The CP earned is computed
      // server-side (immune to tampering). Client computes local fallback
      // for degraded responses.
      const corrected = validation.correctedState;
      const serverPrestigeState = corrected?.prestigeState as
        | {
            corporationPoints?: number;
            totalPrestiges?: number;
            megaFactoryUnlocked?: boolean;
            bonuses?: unknown[];
          }
        | undefined;
      const localPointsEarned = Math.floor(
        state.buildings.length * getBalance().prestige.cpPerBuilding +
          state.completedResearch.length * 2 +
          state.stats.contractsCompleted,
      );
      const finalPrestigeState = serverPrestigeState
        ? {
            corporationPoints:
              serverPrestigeState.corporationPoints ??
              state.prestigeState.corporationPoints + localPointsEarned,
            totalPrestiges:
              serverPrestigeState.totalPrestiges ??
              state.prestigeState.totalPrestiges + 1,
            megaFactoryUnlocked:
              serverPrestigeState.megaFactoryUnlocked ??
              state.prestigeState.megaFactoryUnlocked,
            bonuses:
              (serverPrestigeState.bonuses as never[]) ??
              state.prestigeState.bonuses,
          }
        : {
            // Local fallback (degraded server response)
            corporationPoints:
              state.prestigeState.corporationPoints + localPointsEarned,
            totalPrestiges: state.prestigeState.totalPrestiges + 1,
            megaFactoryUnlocked: state.prestigeState.megaFactoryUnlocked,
            bonuses: state.prestigeState.bonuses,
          };

      // Calculate score for leaderboard entry (uses pre-prestige totals)
      const score = Math.floor(
        state.totalMoneyEarned +
          state.buildings.length * 100 +
          state.completedResearch.length * 200 +
          state.stats.contractsCompleted * 50 +
          (finalPrestigeState.totalPrestiges - 1) * 500,
      );
      const rankThreshold = [...RANK_THRESHOLDS]
        .reverse()
        .find((r) => score >= r.minScore);
      const rankName = rankThreshold?.name ?? "Apprentice";

      // Generate corporation name
      const prefixes = [
        "Factory",
        "Industrial",
        "Global",
        "Prime",
        "Alpha",
        "Omega",
        "Nexus",
        "Apex",
        "Titan",
        "Vanguard",
      ];
      const suffixes = [
        "Corp",
        "Industries",
        "Holdings",
        "Systems",
        "Dynamics",
        "Syndicate",
        "Group",
        "Enterprises",
        "Ventures",
        "Network",
      ];
      const corporationName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;

      set({
        ...createInitialState(),
        prestigeState: finalPrestigeState,
      });

      soundEngine.play("levelUp", "events");
      get().updateQuestProgress("prestige", 1);

      // Submit score to global leaderboard (fire-and-forget)
      // This runs after the state reset so the user doesn't wait
      queueMicrotask(async () => {
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

          const response = await fetch("/api/leaderboard/submit", {
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
              prestigeCount: finalPrestigeState.totalPrestiges,
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
              get().addNotification(
                "success",
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
      });
    },

    purchasePrestigeBonus: (id: string) => {
      const state = get();
      const bonus = state.prestigeState.bonuses.find((b) => b.id === id);
      if (!bonus || bonus.purchased) return;

      if (state.prestigeState.corporationPoints < bonus.cost) {
        get().addNotification(
          "error",
          `Need ${bonus.cost} Corporation Points!`,
        );
        return;
      }

      set({
        prestigeState: {
          ...state.prestigeState,
          corporationPoints: state.prestigeState.corporationPoints - bonus.cost,
          bonuses: state.prestigeState.bonuses.map((b) =>
            b.id === id ? { ...b, purchased: true } : b,
          ),
        },
      });
      soundEngine.play("levelUp", "events");
      get().addNotification("success", `Purchased: ${bonus.name}!`);
    },
  };
}

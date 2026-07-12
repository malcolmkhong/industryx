import { RANK_THRESHOLDS } from "../../config/configCache";
import { soundEngine } from "../../audio/soundEngine";
import { generateId } from "../../shared/utils/generateId";
import { formatNumber } from "../../shared/utils/formatNumber";
import type { SetFn, GetFn } from "./_actionTypes";

// Inline: translate server technical error → user-friendly text.
function friendlyPrestigeError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("at least 5 buildings"))
    return "Need at least 5 buildings to Global Expand!";
  return e || "Prestige could not be performed. Please try again.";
}

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

      // Phase 12: server-authoritative prestige. Server validates minimum
      // buildings, computes Corporation Points (CP) earned, AND returns the
      // FULL canonical reset state (sourced from the same
      // fetchCanonicalInitialState() helper that buildGuestGameState uses).
      // Client just `set(validation.correctedState)` — no local
      // createInitialState() spread (was the anti-pattern that drifted
      // whenever the canonical shape changed).
      const validation = await import("../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer("do_prestige", {}, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        console.error(`[doPrestige] server rejected: ${validation.error}`);
        get().addNotification("error", friendlyPrestigeError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      if (!corrected?.prestigeState) {
        console.error(
          "[doPrestige] server returned no prestigeState; refusing local reset.",
        );
        get().addNotification(
          "error",
          "Prestige could not be confirmed by server. Please retry.",
        );
        return;
      }
      // Type-narrow the prestigeState field so downstream `totalPrestiges`
      // and friends resolve cleanly. Server-returned correctedState is
      // Partial<ServerGameData>; the prestigeState subfield is the canonical
      // PrestigeState shape.
      const finalPrestigeState =
        corrected.prestigeState as { totalPrestiges: number; corporationPoints: number; megaFactoryUnlocked: boolean; bonuses: unknown[] };

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

      // Apply server-returned canonical reset state verbatim. We do NOT
      // spread `createInitialState()` client-side any more — the server
      // owns the shape.
      set(corrected as Parameters<typeof set>[0]);

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

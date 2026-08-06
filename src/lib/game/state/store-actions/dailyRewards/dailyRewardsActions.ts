// ============================================
// Daily Rewards Action — client store wrapper.
//
// IMPORTANT: this is a thin client wrapper around the
// `claim_daily_reward` server action. All streak math, time
// computation, and amount calculation happens server-side. The client
// does NOT maintain any local streak state — `loginStreak` in the
// store is set by server responses (bootstrap, claim-daily-reward,
// live-tick, offline-progress).
// ============================================
import type { ServerGameData } from "../../../shared/types/types";
import { soundEngine } from "../../../audio/soundEngine";
import { generateId } from "../../../shared/utils/generateId";
import type { SetFn, GetFn } from "../_actionTypes";

export function createDailyRewardActions(set: SetFn, get: GetFn) {
  return {
    claimDailyReward: async (day: number) => {
      const validation = await import(
        "../../../actions/client/actionValidator"
      ).then((m) =>
        m.validateActionWithServer(
          "claim_daily_reward",
          { day },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "building");
        get().addNotification(
          "error",
          validation.error ?? "Daily reward claim rejected by server",
        );
        return;
      }

      const corrected = validation.correctedState;
      if (!corrected?.loginStreak) {
        soundEngine.play("error", "building");
        get().addNotification(
          "error",
          "Daily reward could not be confirmed by server. Please retry.",
        );
        return;
      }

      // Server returns the authoritative corrected state — apply only
      // the fields the server explicitly set.
      const updates: Partial<ServerGameData> = { loginStreak: corrected.loginStreak };
      if (corrected.money !== undefined) updates.money = corrected.money;
      if (corrected.totalMoneyEarned !== undefined) updates.totalMoneyEarned = corrected.totalMoneyEarned;
      if (corrected.researchPoints !== undefined) updates.researchPoints = corrected.researchPoints;
      if (corrected.resources) updates.resources = corrected.resources;
      if (corrected.prestigeState) updates.prestigeState = corrected.prestigeState;

      set(updates);
      soundEngine.play("moneyEarned", "building");
      get().addNotification("success", `Claimed daily reward: Day ${day}!`);
    },
  };
}
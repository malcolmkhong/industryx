import { soundEngine } from "../../audio/soundEngine";
import { formatNumber } from "../../shared/utils/formatNumber";
import { generateId } from "../../shared/utils/generateId";
import type { SetFn, GetFn } from "./_actionTypes";

export function createPayoutActions(set: SetFn, get: GetFn) {
  return {
    collectPayout: async () => {
      const state = get();
      if (state.pendingPayout <= 0) return;

      // Phase 6: server-authoritative payout. Server reads its own
      // computed `pendingPayout` (from runServerTicks via applyElapsedTicks)
      // and returns the post-collection money/totalMoneyEarned/pendingPayout.
      // Server is immune to client tampering with state.pendingPayout.
      const validation = await import("../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer("collect_payout", {}, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Payout collection rejected by server",
        );
        return;
      }

      const corrected = validation.correctedState;
      if (
        !corrected ||
        typeof corrected.money !== "number" ||
        typeof corrected.totalMoneyEarned !== "number" ||
        typeof corrected.pendingPayout !== "number"
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Payout could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        money: corrected.money,
        totalMoneyEarned: corrected.totalMoneyEarned,
        pendingPayout: corrected.pendingPayout,
      });
      soundEngine.play("moneyEarned", "building");
      get().addNotification(
        "success",
        `💰 Collected payout: $${formatNumber(state.pendingPayout)}`,
      );
    },

    toggleAutoCollect: () => {
      const state = get();
      set({
        payoutConfig: {
          ...state.payoutConfig,
          autoCollect: !state.payoutConfig.autoCollect,
        },
      });
    },
  };
}

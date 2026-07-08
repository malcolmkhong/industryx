import { soundEngine } from "../soundEngine";
import { formatNumber } from "../utils/formatNumber";
import { generateId } from "../utils/generateId";

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

export function createPayoutActions(set: SetFn, get: GetFn) {
  return {
    collectPayout: async () => {
      const state = get();
      if (state.pendingPayout <= 0) return;

      // Phase 6: server-authoritative payout. Server reads its own
      // computed `pendingPayout` (from runServerTicks via applyElapsedTicks)
      // and returns the post-collection money/totalMoneyEarned/pendingPayout.
      // Server is immune to client tampering with state.pendingPayout.
      const validation = await import("../actionValidator").then((m) =>
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

      // Apply server-authoritative state.
      const serverMoney =
        validation.correctedState?.money ?? state.money + state.pendingPayout;
      const serverTotalEarned =
        validation.correctedState?.totalMoneyEarned ??
        state.totalMoneyEarned + state.pendingPayout;
      const serverPendingPayout = validation.correctedState?.pendingPayout ?? 0;

      set({
        money: serverMoney,
        totalMoneyEarned: serverTotalEarned,
        pendingPayout: serverPendingPayout,
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

import type { Contract } from "../types";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { soundEngine } from "../soundEngine";
import type { SetFn, GetFn } from "./_actionTypes";

export function createContractActions(set: SetFn, get: GetFn) {
  return {
    acceptContract: (contract: Contract) => {
      const state = get();
      if (
        state.contracts.filter((c) => !c.completed && !c.failed).length >= 5
      ) {
        get().addNotification("warning", "Too many active contracts!");
        return;
      }
      set({ contracts: [...state.contracts, contract] });
      get().addNotification("info", `Accepted contract: ${contract.name}`);
    },

    fulfillContract: async (id: string) => {
      const state = get();
      const contract = state.contracts.find((c) => c.id === id);
      if (!contract || contract.completed || contract.failed) return;

      // Phase 6: server-authoritative contract fulfillment. Server
      // validates affordability, deducts required resources, applies
      // reward (money + RP + corpPoints), and marks the contract as
      // completed.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "fulfill_contract",
          { contractId: id },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Contract fulfillment rejected by server",
        );
        return;
      }

      const corrected = validation.correctedState;
      if (
        !corrected ||
        typeof corrected.money !== "number" ||
        typeof corrected.totalMoneyEarned !== "number" ||
        typeof corrected.researchPoints !== "number" ||
        !corrected.resources ||
        !corrected.contracts ||
        typeof corrected.completedContracts !== "number" ||
        !corrected.stats ||
        !corrected.prestigeState
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Contract could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        money: corrected.money,
        totalMoneyEarned: corrected.totalMoneyEarned,
        researchPoints: corrected.researchPoints,
        resources: corrected.resources as Record<string, number>,
        contracts: corrected.contracts as typeof state.contracts,
        completedContracts: corrected.completedContracts,
        stats: {
          ...state.stats,
          contractsCompleted:
            (corrected.stats as { contractsCompleted?: number })
              .contractsCompleted ?? state.stats.contractsCompleted,
        },
        prestigeState: corrected.prestigeState as typeof state.prestigeState,
      });
      soundEngine.play("contractCompleted", "events");
      get().addNotification(
        "success",
        `Contract fulfilled: ${contract.name}! +$${formatNumber(contract.reward.money)}`,
      );
      get().updateQuestProgress("contract", 1);
    },
  };
}

import type { Contract, ResourceType } from "../types";
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

      // Apply server-authoritative state. Defensive fallback to local
      // computation if server omits correctedState.
      const fallbackMoney = (() => {
        const newResources = { ...state.resources };
        contract.requiredResources.forEach((r) => {
          if (r.resource !== "money") {
            newResources[r.resource as ResourceType] =
              (newResources[r.resource as ResourceType] ?? 0) - r.amount;
          }
        });
        const moneyDelta = contract.requiredResources
          .filter((r) => r.resource === "money")
          .reduce((sum, r) => sum + r.amount, 0);
        return {
          money: state.money + contract.reward.money - moneyDelta,
          totalMoneyEarned: state.totalMoneyEarned + contract.reward.money,
          resources: newResources,
        };
      })();

      set({
        money: corrected?.money ?? fallbackMoney.money,
        totalMoneyEarned:
          corrected?.totalMoneyEarned ?? fallbackMoney.totalMoneyEarned,
        researchPoints:
          corrected?.researchPoints ??
          state.researchPoints + (contract.reward.researchPoints ?? 0),
        resources:
          (corrected?.resources as Record<string, number>) ??
          fallbackMoney.resources,
        contracts:
          (corrected?.contracts as typeof state.contracts) ??
          state.contracts.map((c) =>
            c.id === id ? { ...c, completed: true, progress: 1 } : c,
          ),
        completedContracts:
          corrected?.completedContracts ?? state.completedContracts + 1,
        stats: {
          ...state.stats,
          contractsCompleted:
            (corrected?.stats as { contractsCompleted?: number } | undefined)
              ?.contractsCompleted ?? state.stats.contractsCompleted + 1,
        },
        prestigeState: (corrected?.prestigeState as
          typeof state.prestigeState | undefined) ?? {
          ...state.prestigeState,
          corporationPoints:
            state.prestigeState.corporationPoints +
            (contract.reward.corporationPoints ?? 0),
        },
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

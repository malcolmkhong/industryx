import type { ResourceType } from "../../../shared/types/types";
import { RESOURCE_META } from "../../../config/configCache";
import { getGlobalPrice } from "../../../shared/utils/gameMath";

import { generateId } from "../../../shared/utils/generateId";
import { formatNumber } from "../../../shared/utils/formatNumber";
import { soundEngine } from "../../../audio/soundEngine";
import type { SetFn, GetFn } from "../_actionTypes";
import { friendlyTradeError } from "./friendlyTradeError";
import { notifyTradeImpactIfMoved } from "./notifyTradeImpact";

export function createMarketActions(set: SetFn, get: GetFn) {
  return {
    sellResource: async (resource: ResourceType, amount: number) => {
      const state = get();
      if (state.resources[resource] < amount) {
        soundEngine.play("error", "ui");
        get().addNotification("error", "Not enough resources!");
        return;
      }

      // Capture the local price pre-call so notifyTradeImpactIfMoved can
      // compare later. Use the server-authoritative market price computed
      // below if validation succeeds.
      const localPrice = getGlobalPrice(state, resource);

      // Report trade to global market pressure pool (best-effort, fire-and-forget)
      fetch("/api/market/pressure/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, type: "sell", amount }),
      }).catch((err) =>
        console.warn("[Market] sellResource pressure report failed:", err),
      );

      // Phase 6: server-authoritative sell. Server reads price from
      // state.market (immune to client tampering), computes revenue with
      // server-side sellMultiplier, validates resource affordability,
      // and returns authoritative post-sell state.
      const validation = await import("../../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer("sell", { resource, amount }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        // Log server-side technical error for debugging
        console.error(`[sellResource] server rejected: ${validation.error}`);
        // Show user-friendly message (no internal leak)
        get().addNotification("error", friendlyTradeError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      if (
        !corrected ||
        typeof corrected.money !== "number" ||
        typeof corrected.totalMoneyEarned !== "number" ||
        !corrected.resources
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Sell could not be confirmed by server. Please retry.",
        );
        return;
      }
      const serverMoney = corrected.money;
      const serverTotalEarned = corrected.totalMoneyEarned;
      const serverResources = corrected.resources as Record<string, number>;
      const serverSoldStats = (
        corrected.stats as { totalResourcesSold?: Record<string, number> } | undefined
      )?.totalResourcesSold;
      if (!serverSoldStats) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Sell stats could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        resources: serverResources,
        money: serverMoney,
        totalMoneyEarned: serverTotalEarned,
        stats: {
          ...(state.stats ?? {
            totalResourcesProduced: {} as Record<string, number>,
            totalResourcesSold: {} as Record<string, number>,
            peakEfficiency: 0,
            factoriesBuilt: 0,
            transportLinesBuilt: 0,
            researchCompleted: 0,
            contractsCompleted: 0,
            playTime: 0,
          }),
          totalResourcesSold: serverSoldStats,
        },
      });
      soundEngine.play("moneyEarned", "production");
      // Effective price per unit (for the notification + impact-check)
      const effectivePrice =
        serverMoney - state.money > 0 && amount > 0
          ? (serverMoney - state.money) / amount
          : localPrice;
      get().addNotification(
        "success",
        `Sold ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(serverMoney - state.money)}`,
      );
      get().updateQuestProgress("sell", 1);
      // Phase 3 F5: schedule delayed price-impact check.
      notifyTradeImpactIfMoved(resource, effectivePrice);
    },

    buyResource: async (resource: ResourceType, amount: number) => {
      const state = get();
      const globalPrice = getGlobalPrice(state, resource);
      if (globalPrice <= 0) return;

      // Report trade to global market pressure pool
      fetch("/api/market/pressure/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, type: "buy", amount }),
      }).catch((err) =>
        console.warn("[Market] buyResource pressure report failed:", err),
      );

      // Phase 6: server-authoritative buy. Server reads price from
      // state.market, computes cost with markup, validates affordability
      // AND storage capacity, and returns authoritative post-buy state.
      const validation = await import("../../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer("buy", { resource, amount }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        // Log server-side technical error for debugging
        console.error(`[buyResource] server rejected: ${validation.error}`);
        // Show user-friendly message (no internal leak)
        get().addNotification("error", friendlyTradeError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      if (
        !corrected ||
        typeof corrected.money !== "number" ||
        !corrected.resources
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Purchase could not be confirmed by server. Please retry.",
        );
        return;
      }
      const serverMoney = corrected.money;
      const serverResources = corrected.resources as Record<string, number>;

      set({
        resources: serverResources,
        money: serverMoney,
      });
      const effectiveCost = state.money - serverMoney;
      get().addNotification(
        "info",
        `Bought ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(effectiveCost)}`,
      );
      // Phase 3 F5: schedule delayed price-impact check.
      const buyPrice = effectiveCost / amount;
      notifyTradeImpactIfMoved(resource, buyPrice);
    },

    toggleAutoSell: (resource: ResourceType) => {
      const state = get();
      const current = state.autoSellResources;
      if (current.includes(resource)) {
        set({ autoSellResources: current.filter((r) => r !== resource) });
      } else {
        set({ autoSellResources: [...current, resource] });
      }
    },
  };
}

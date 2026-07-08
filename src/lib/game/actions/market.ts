import type { ResourceType } from "../types";
import { RESOURCE_META } from "../configCache";
import { getGlobalPrice } from "../utils/gameMath";
import {
  computeSellMultiplier,
  buildMultipliers,
} from "../productionCalculator";
import { getBalance } from "../balanceConfig";
import { getCapacity } from "../utils/costCalculator";
import { useGameStore } from "../store";

import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { soundEngine } from "../soundEngine";

// Phase 3 F5: dedupe so a single trade doesn't trigger multiple "you moved the
// market" notifications when the polling eventually catches up.
const tradeImpactNotifiedAt: Record<string, number> = {};
const TRADE_IMPACT_NOTIFY_COOLDOWN_MS = 10_000;

/**
 * Phase 3 F5 (+U2 reuse): schedule a delayed check of `/api/market/state` to
 * detect whether the player's trade measurably moved the global price.
 * If yes (>=5% abs move), push an `info` notification.
 *
 * Self-contained: uses `useGameStore.getState()` so callers don't need to
 * pass set/get. Safe to call from any context that owns a resource price.
 *
 * Dedupe: 10s per-resource cooldown to avoid spamming notifications when
 * the polling hook catches up.
 */
export async function notifyTradeImpactIfMoved(
  resource: ResourceType,
  priceBefore: number,
  delayMs = 5000,
) {
  // Dedupe: if we already notified for this resource inside the cooldown window, skip.
  const last = tradeImpactNotifiedAt[resource] ?? 0;
  if (Date.now() - last < TRADE_IMPACT_NOTIFY_COOLDOWN_MS) return;
  tradeImpactNotifiedAt[resource] = Date.now();

  setTimeout(async () => {
    try {
      const res = await fetch("/api/market/state", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const prices = Array.isArray(data?.prices) ? data.prices : [];
      const found = prices.find(
        (p: { resource?: string }) => p?.resource === resource,
      );
      const newPrice = Number(found?.currentPrice);
      if (!Number.isFinite(newPrice) || newPrice <= 0 || priceBefore <= 0)
        return;
      const changePct = (newPrice - priceBefore) / priceBefore;
      if (Math.abs(changePct) >= 0.05) {
        const direction = changePct > 0 ? "up" : "down";
        const arrow = changePct > 0 ? "▲" : "▼";
        const pctStr = (Math.abs(changePct) * 100).toFixed(1);
        const resourceName = RESOURCE_META[resource]?.name ?? resource;
        useGameStore
          .getState()
          .addNotification(
            "info",
            `${arrow} ${resourceName} ${direction === "up" ? "spiked" : "dropped"} ${pctStr}% — your trade moved the market`,
          );
      }
    } catch {
      // Silent: the player didn't see a market move; nothing to report.
    }
  }, delayMs);
}

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

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
      fetch("/api/market/action", {
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
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer("sell", { resource, amount }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Sell rejected by server",
        );
        return;
      }

      // Apply server-authoritative state. Defensive fallback to local
      // computation if server omits correctedState.
      const corrected = validation.correctedState;
      const fallbackSellPrice =
        localPrice > 0
          ? localPrice *
            amount *
            computeSellMultiplier(state, buildMultipliers(state))
          : 0;

      const serverMoney = corrected?.money ?? state.money + fallbackSellPrice;
      const serverTotalEarned =
        corrected?.totalMoneyEarned ??
        state.totalMoneyEarned + fallbackSellPrice;
      const serverResources = (corrected?.resources as Record<
        string,
        number
      >) ?? {
        ...state.resources,
        [resource]: state.resources[resource] - amount,
      };
      const serverSoldStats = (
        corrected?.stats as { totalResourcesSold?: Record<string, number> }
      )?.totalResourcesSold ?? {
        ...(state.stats?.totalResourcesSold ?? {}),
        [resource]: (state.stats?.totalResourcesSold?.[resource] ?? 0) + amount,
      };

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
          : fallbackSellPrice / Math.max(1, amount);
      get().addNotification(
        "success",
        `Sold ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(serverMoney - state.money)}`,
      );
      get().updateQuestProgress("sell", 1);
      // Phase 3 F5: schedule delayed price-impact check.
      await notifyTradeImpactIfMoved(resource, effectivePrice);
    },

    buyResource: async (resource: ResourceType, amount: number) => {
      const state = get();
      const globalPrice = getGlobalPrice(state, resource);
      if (globalPrice <= 0) return;

      const cost = globalPrice * amount * getBalance().market.buyPriceMarkup;
      if (state.money < cost) {
        soundEngine.play("error", "ui");
        get().addNotification("error", "Not enough money!");
        return;
      }

      const newAmount = state.resources[resource] + amount;
      if (newAmount > getCapacity(state, resource)) {
        soundEngine.play("error", "ui");
        get().addNotification("warning", "Storage full!");
        return;
      }

      // Report trade to global market pressure pool
      fetch("/api/market/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, type: "buy", amount }),
      }).catch((err) =>
        console.warn("[Market] buyResource pressure report failed:", err),
      );

      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer("buy", { resource, amount }, generateId()),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Buy rejected by server",
        );
        return;
      }

      set({
        resources: { ...state.resources, [resource]: newAmount },
        money: state.money - cost,
      });
      get().addNotification(
        "info",
        `Bought ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(cost)}`,
      );
      // Phase 3 F5: schedule delayed price-impact check.
      const buyPrice = cost / amount;
      await notifyTradeImpactIfMoved(resource, buyPrice);
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

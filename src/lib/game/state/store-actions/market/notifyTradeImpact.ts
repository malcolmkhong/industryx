import type { ResourceType } from "../../../shared/types/types";
import { RESOURCE_META } from "../../../config/configCache";
import { useGameStore } from "../../store";

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
export function notifyTradeImpactIfMoved(
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

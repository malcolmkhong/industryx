// Server-authoritative trade validators (sell + buy).
//
// Validates input args, market entry existence, price sanity, availability /
// capacity. Delegates state mutation to applySellMutation / applyBuyMutation.

import { getBalance } from "../../../config/balance/balanceConfig";
import { applySellMutation, applyBuyMutation } from "../mutators/trade";
import type { ResourceType, ServerGameData } from "../../../shared/types/types";

export function validateSellAction(
  resource: string,
  amount: number,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!resource || typeof resource !== "string") {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return {
      valid: false,
      error: `Invalid amount: ${amount}. Must be a positive integer.`,
    };
  }

  const market = state.market ?? [];
  const marketEntry = market.find((m) => m.resource === resource);
  if (!marketEntry) {
    return {
      valid: false,
      error: `No market found for resource "${resource}"`,
    };
  }
  if (
    !Number.isFinite(marketEntry.currentPrice) ||
    marketEntry.currentPrice <= 0
  ) {
    return {
      valid: false,
      error: `Market price for ${resource} is invalid (${marketEntry.currentPrice})`,
    };
  }

  const resources = state.resources ?? {};
  const available = resources[resource as ResourceType] ?? 0;
  if (available < amount) {
    return {
      valid: false,
      error: `Not enough ${resource} to sell. Have ${Math.floor(available)}, want to sell ${amount}`,
    };
  }

  const sellMultiplier = getBalance().market.baseSellMultiplier;
  const sellRevenue = marketEntry.currentPrice * amount * sellMultiplier;

  if (!Number.isFinite(sellRevenue) || sellRevenue < 0) {
    return {
      valid: false,
      error: `Computed sell price is non-finite (price=${marketEntry.currentPrice}, multiplier=${sellMultiplier})`,
    };
  }

  return {
    valid: true,
    correctedState: applySellMutation(
      { resource, amount, currentPrice: marketEntry.currentPrice },
      state,
    ),
  };
}

export function validateBuyAction(
  resource: string,
  amount: number,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!resource || typeof resource !== "string") {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return {
      valid: false,
      error: `Invalid amount: ${amount}. Must be a positive integer.`,
    };
  }

  const market = state.market ?? [];
  const marketEntry = market.find((m) => m.resource === resource);
  if (!marketEntry) {
    return {
      valid: false,
      error: `No market found for resource "${resource}"`,
    };
  }
  if (
    !Number.isFinite(marketEntry.currentPrice) ||
    marketEntry.currentPrice <= 0
  ) {
    return {
      valid: false,
      error: `Market price for ${resource} is invalid (${marketEntry.currentPrice})`,
    };
  }

  const markup = getBalance().market.buyPriceMarkup;
  const totalCost = marketEntry.currentPrice * amount * markup;

  if (!Number.isFinite(totalCost) || totalCost < 0) {
    return {
      valid: false,
      error: `Computed buy cost is non-finite (price=${marketEntry.currentPrice}, markup=${markup})`,
    };
  }

  const money = state.money ?? 0;
  if (money < totalCost) {
    return {
      valid: false,
      error: `Not enough money. Need $${Math.floor(totalCost)}, have $${Math.floor(money)}`,
    };
  }

  const resources = state.resources ?? {};
  const currentAmount = resources[resource as ResourceType] ?? 0;
  const capacity =
    state.resourceCapacity?.[resource as ResourceType] ?? Infinity;
  const proposedAmount = currentAmount + amount;
  if (proposedAmount > capacity) {
    return {
      valid: false,
      error: `Storage full. Have ${Math.floor(currentAmount)}, capacity ${Math.floor(capacity)}, trying to add ${amount}`,
    };
  }

  return {
    valid: true,
    correctedState: applyBuyMutation(
      { resource, amount, proposedAmount, currentPrice: marketEntry.currentPrice },
      state,
    ),
  };
}
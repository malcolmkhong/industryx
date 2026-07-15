// Server-authoritative trade mutations (sell + buy).
//
// Assumes validator has already verified: market entry exists, price is finite
// positive, amount is positive integer, resource availability / storage
// capacity. Mutator applies the delta: sell adds money + bumps totalMoneyEarned;
// buy deducts money and adds the resource.

import { getBalance } from "../../../config/balance/balanceConfig";
import type { ResourceType, ServerGameData } from "../../../shared/types/types";

export interface SellMutationInput {
  resource: string;
  amount: number;
  currentPrice: number;
}

export function applySellMutation(
  input: SellMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { resource, amount, currentPrice } = input;

  const sellMultiplier = getBalance().market.baseSellMultiplier;
  const sellRevenue = currentPrice * amount * sellMultiplier;

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const resources = state.resources ?? {};

  const soldStats =
    state.stats?.totalResourcesSold ?? ({} as Record<string, number>);
  const newSoldStats: Record<string, number> = { ...soldStats };
  newSoldStats[resource] = (newSoldStats[resource] ?? 0) + amount;

  const newResources: Record<string, number> = { ...resources };
  newResources[resource as ResourceType] = (resources[resource as ResourceType] ?? 0) - amount;

  return {
    money: money + sellRevenue,
    totalMoneyEarned: totalMoneyEarned + sellRevenue,
    resources: newResources,
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
      totalResourcesSold: newSoldStats,
    },
  };
}

export interface BuyMutationInput {
  resource: string;
  amount: number;
  proposedAmount: number; // currentAmount + amount (capped at capacity)
  currentPrice: number;
}

export function applyBuyMutation(
  input: BuyMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { resource, amount, proposedAmount, currentPrice } = input;

  const markup = getBalance().market.buyPriceMarkup;
  const totalCost = currentPrice * amount * markup;

  const money = state.money ?? 0;
  const resources = state.resources ?? {};

  const newResources: Record<string, number> = { ...resources };
  newResources[resource as ResourceType] = proposedAmount;

  return {
    money: money - totalCost,
    resources: newResources,
  };
}
// ============================================
// market.ts — market domain types.
// ============================================
//
// MarketPrice only. Sector/News/Narrative helpers stay defined in
// `marketSimulator.ts`; consumers (e.g. server.ts) import them
// directly when needed.
// ============================================

import type { ResourceType } from "./resources";

export interface MarketPrice {
  resource: ResourceType;
  basePrice: number;
  currentPrice: number;
  priceHistory: number[];
  demand: number; // 0-2 multiplier
  supply: number; // 0-2 multiplier
  trend: "up" | "down" | "stable";
  volatility: number; // 0-1
}

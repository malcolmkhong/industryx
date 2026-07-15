import type { SupabaseMarket } from "../types/supabaseRows";
import type { GameConfig } from "../types/gameConfig";

export function transformMarket(market: SupabaseMarket[]): GameConfig['market'] {
  return market.map(m => ({
    resource: m.resource_id,
    basePrice: m.base_price,
    demand: m.demand,
    supply: m.supply,
    volatility: m.volatility,
    isTradable: m.is_tradable,
  }));
}

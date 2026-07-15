import type { SupabaseResource } from "../types/supabaseRows";
import type { GameConfig } from "../types/gameConfig";

export function transformResources(resources: SupabaseResource[]): GameConfig['resources'] {
  const result: GameConfig['resources'] = {};
  for (const r of resources) {
    result[r.id] = {
      name: r.name,
      icon: r.icon,
      tier: r.tier,
      color: r.color,
      category: r.category,
      baseCapacity: r.base_capacity || 100,
    };
  }
  return result;
}

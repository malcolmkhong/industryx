import type { SupabaseResearch } from "../types/supabaseRows";
import type { GameConfig } from "../types/gameConfig";

export function transformResearch(research: SupabaseResearch[]): GameConfig['research'] {
  return research.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    tier: r.tier,
    cost: r.cost,
    timeRequired: r.time_required,
    prerequisites: r.prerequisites || [],
    effects: (r.effects as Record<string, unknown>[]) || [],
    icon: r.icon,
  }));
}

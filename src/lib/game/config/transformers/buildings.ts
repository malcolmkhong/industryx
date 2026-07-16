import type { BuildingDefinition, ResourceAmount, ResourceType } from "../../shared/types/types";
import type { SupabaseBuilding, SupabaseRecipe } from "../types/supabaseRows";

export function parseCostMap(costMap: Record<string, number> | Array<{resource: string; amount: number}> | null): ResourceAmount[] {
  // C-005 (BUILDING_PRODUCTION_AUDIT §10.6 P1, 2026-07-16): fail closed
  // on missing or null cost. A missing `base_cost` row is a DB-integrity
  // bug; silently fabricating a 100-money default would mask it and
  // could let a player build something at a non-existent price.
  if (!costMap) {
    throw new Error(
      "[parseCostMap] building has null/missing base_cost — refusing to fabricate a cost",
    );
  }
  // Handle array format from Supabase: [{resource: 'money', amount: 500}]
  if (Array.isArray(costMap)) {
    return costMap.map(item => ({
      resource: item.resource as ResourceType | 'money',
      amount: item.amount,
    }));
  }
  // Handle legacy object format: {money: 500}
  return Object.entries(costMap).map(([resource, amount]) => ({
    resource: resource as ResourceType | 'money',
    amount,
  }));
}

export function transformBuildings(
  buildings: SupabaseBuilding[],
  recipes: SupabaseRecipe[]
): Record<string, BuildingDefinition> {
  const result: Record<string, BuildingDefinition> = {};

  for (const b of buildings) {
    const buildingRecipes = recipes.filter(r => r.building_id === b.id);
    const inputs: ResourceAmount[] = buildingRecipes
      .filter(r => r.is_input)
      .map(r => ({ resource: r.resource_id as ResourceType, amount: r.amount }));
    const outputs: ResourceAmount[] = buildingRecipes
      .filter(r => !r.is_input)
      .map(r => ({ resource: r.resource_id as ResourceType, amount: r.amount }));

    result[b.id] = {
      type: b.id as BuildingDefinition['type'],
      name: b.name,
      description: b.description,
      category: b.category as BuildingDefinition['category'],
      tier: b.tier,
      baseCost: parseCostMap(b.base_cost),
      costMultiplier: b.cost_multiplier,
      basePowerConsumption: b.base_power_consumption,
      basePowerProduction: b.base_power_production,
      baseProductionRate: b.base_production_rate,
      ...(inputs.length > 0 ? { inputs } : {}),
      ...(outputs.length > 0 ? { outputs } : {}),
      ...(b.fuel ? { fuel: b.fuel as ResourceType } : {}),
      ...(b.fuel_rate ? { fuelRate: b.fuel_rate } : {}),
      ...(b.unlock_research || b.unlock_prestige ? {
        unlockRequirement: {
          ...(b.unlock_research ? { research: b.unlock_research } : {}),
          ...(b.unlock_prestige ? { prestige: b.unlock_prestige } : {}),
        }
      } : {}),
      icon: b.icon,
    };
  }

  return result;
}

import type {
  CostResourceType,
  ResourceAmount,
} from "@/lib/game/shared/types/types";

/**
 * Coerce a Supabase-shaped cost column into a uniform `ResourceAmount[]`.
 *
 * Accepts:
 *  - `null`/`undefined` → sentinel cost of 100 money
 *  - array of `{ resource, amount }` (canonical form)
 *  - `{ resourceKey: amount }` map (legacy form)
 */
export function parseCostMap(
  costMap:
    | Record<string, number>
    | Array<{ resource: string; amount: number }>
    | null,
): ResourceAmount[] {
  // C-005 (BUILDING_PRODUCTION_AUDIT §10.6 P1, 2026-07-16): fail closed
  // on missing or null cost. Matches the offline-progress route.
  if (!costMap) {
    throw new Error(
      "[parseCostMap] building has null/missing base_cost — refusing to fabricate a cost",
    );
  }
  if (Array.isArray(costMap)) {
    return costMap.map((item) => ({
      resource: item.resource as CostResourceType,
      amount: item.amount,
    }));
  }
  return Object.entries(costMap).map(([resource, amount]) => ({
    resource: resource as CostResourceType,
    amount,
  }));
}
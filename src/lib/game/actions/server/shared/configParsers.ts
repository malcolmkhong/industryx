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
  if (!costMap) return [{ resource: "money", amount: 100 }];
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
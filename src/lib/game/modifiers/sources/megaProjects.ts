// Mega-project → Modifier[] adapter.

import type { Modifier } from "../types";

/** Create mega project modifiers from completed MegaProject[] */
export function megaProjectToModifiers(
  megaProjects: Array<{
    type: string;
    completed: boolean;
    bonus: { type: string; value: number };
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const p of megaProjects) {
    if (!p.completed) continue;

    const baseId = `megaProject:${p.type}`;

    switch (p.bonus.type) {
      case 'productionMultiplier':
        modifiers.push({
          id: `${baseId}:production`,
          source: 'megaProject',
          target: 'production.payout',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% production from ${p.type}`,
        });
        break;
      case 'extractionMultiplier':
        modifiers.push({
          id: `${baseId}:extraction`,
          source: 'megaProject',
          target: 'production.extractor',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% extraction from ${p.type}`,
        });
        break;
      case 'powerMultiplier':
        modifiers.push({
          id: `${baseId}:power`,
          source: 'megaProject',
          target: 'power.production',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% power from ${p.type}`,
        });
        break;
      case 'researchMultiplier':
        modifiers.push({
          id: `${baseId}:research`,
          source: 'megaProject',
          target: 'research.speed',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% research from ${p.type}`,
        });
        break;
      case 'workerEfficiency':
        modifiers.push({
          id: `${baseId}:worker`,
          source: 'megaProject',
          target: 'worker.efficiency',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% worker efficiency from ${p.type}`,
        });
        break;
      case 'transportMultiplier':
        modifiers.push({
          id: `${baseId}:transport`,
          source: 'megaProject',
          target: 'transport.throughput',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% transport from ${p.type}`,
        });
        break;
      case 'marketMultiplier':
        modifiers.push({
          id: `${baseId}:market`,
          source: 'megaProject',
          target: 'market.sellPrice',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% sell price from ${p.type}`,
        });
        break;
      case 'buildingCostReduction':
        modifiers.push({
          id: `${baseId}:costReduction`,
          source: 'megaProject',
          target: 'building.cost',
          operation: 'multiply',
          value: 1 - p.bonus.value,
          sourceId: p.type,
          description: `-${Math.round(p.bonus.value * 100)}% building cost from ${p.type}`,
        });
        break;
      // 'unlimitedStorage' is a flag, not a numeric modifier
    }
  }

  return modifiers;
}

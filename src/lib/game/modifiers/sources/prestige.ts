// Prestige bonus → Modifier[] adapter.

import type { Modifier } from "../types";

/** Create prestige modifiers from PrestigeBonus[] */
export function prestigeToModifiers(
  bonuses: Array<{
    id: string;
    purchased: boolean;
    effect: { type: string; value: number };
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const b of bonuses) {
    if (!b.purchased) continue;

    const baseId = `prestige:${b.id}`;

    switch (b.effect.type) {
      case 'productionMultiplier':
        modifiers.push({
          id: `${baseId}:production`,
          source: 'prestige',
          target: 'production.payout',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% production from prestige`,
        });
        break;
      case 'powerMultiplier':
        modifiers.push({
          id: `${baseId}:power`,
          source: 'prestige',
          target: 'power.production',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% power from prestige`,
        });
        break;
      case 'researchMultiplier':
        modifiers.push({
          id: `${baseId}:research`,
          source: 'prestige',
          target: 'research.speed',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% research from prestige`,
        });
        break;
      case 'marketMultiplier':
        modifiers.push({
          id: `${baseId}:market`,
          source: 'prestige',
          target: 'market.sellPrice',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% sell price from prestige`,
        });
        break;
      case 'storageMultiplier':
        modifiers.push({
          id: `${baseId}:storage`,
          source: 'prestige',
          target: 'storage.capacity',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% storage from prestige`,
        });
        break;
      case 'offlineMultiplier':
        modifiers.push({
          id: `${baseId}:offline`,
          source: 'prestige',
          target: 'offline.rate',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% offline rate from prestige`,
        });
        break;
    }
  }

  return modifiers;
}

// Research-effect → Modifier[] adapter.

import type { Modifier } from "../types";

/** Create a research modifier from a ResearchEffect */
export function researchToModifiers(
  researchId: string,
  effects: Array<{
    type: string;
    target?: string;
    value: number;
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const effect of effects) {
    const baseId = `research:${researchId}:${effect.type}`;

    switch (effect.type) {
      case 'productionSpeed':
        if (effect.target === 'extractor') {
          modifiers.push({
            id: `${baseId}:extractor`,
            source: 'research',
            target: 'production.extractor',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% extractor speed`,
          });
        } else if (effect.target === 'factory') {
          modifiers.push({
            id: `${baseId}:factory`,
            source: 'research',
            target: 'production.factory',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% factory speed`,
          });
        } else if (effect.target === 't1Factory') {
          modifiers.push({
            id: `${baseId}:t1Factory`,
            source: 'research',
            target: 'production.factory.t1',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% T1 factory speed`,
          });
        } else if (effect.target === 't2Factory') {
          modifiers.push({
            id: `${baseId}:t2Factory`,
            source: 'research',
            target: 'production.factory.t2',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% T2 factory speed`,
          });
        } else if (effect.target === 't3Factory') {
          modifiers.push({
            id: `${baseId}:t3Factory`,
            source: 'research',
            target: 'production.factory.t3',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% T3 factory speed`,
          });
        } else if (effect.target) {
          // Building-specific production speed (e.g., 'aiLab', 'quantumLab')
          modifiers.push({
            id: `${baseId}:${effect.target}`,
            source: 'research',
            target: `production.building.${effect.target}` as Modifier['target'],
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            subTarget: effect.target,
            description: `+${Math.round(effect.value * 100)}% ${effect.target} speed`,
          });
        }
        break;

      case 'transportSpeed':
        modifiers.push({
          id: `${baseId}:transport`,
          source: 'research',
          target: 'transport.throughput',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% transport speed`,
        });
        break;

      case 'powerEfficiency':
        modifiers.push({
          id: `${baseId}:powerEfficiency`,
          source: 'research',
          target: 'power.consumption',
          operation: 'multiply',
          value: 1 - effect.value, // reduction = multiply by (1 - value)
          sourceId: researchId,
          description: `-${Math.round(effect.value * 100)}% power consumption`,
        });
        break;

      case 'marketBonus':
        modifiers.push({
          id: `${baseId}:marketBonus`,
          source: 'research',
          target: 'market.sellPrice',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% sell price`,
        });
        break;

      case 'workerEfficiency':
        modifiers.push({
          id: `${baseId}:workerEfficiency`,
          source: 'research',
          target: 'worker.efficiency',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% worker efficiency`,
        });
        break;

      case 'storageBonus':
        modifiers.push({
          id: `${baseId}:storageBonus`,
          source: 'research',
          target: 'storage.capacity',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% storage capacity`,
        });
        break;

      case 'unlockBuilding':
      case 'unlockTransport':
      case 'unlockAutomation':
        // Unlock effects are NOT modifiers — they unlock content
        // These are handled by the existing unlockRequirement system
        break;
    }
  }

  return modifiers;
}

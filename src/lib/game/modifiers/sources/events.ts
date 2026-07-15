// Active event → Modifier[] adapter.

import type { Modifier } from "../types";

/** Create event modifiers from active GameEvent[] */
export function eventsToModifiers(
  events: Array<{
    id: string;
    effects: Array<{ type: string; target?: string; value: number }>;
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const event of events) {
    for (const effect of event.effects) {
      const baseId = `event:${event.id}:${effect.type}`;

      switch (effect.type) {
        case 'productionMultiplier':
          if (effect.target) {
            modifiers.push({
              id: `${baseId}:targeted:${effect.target}`,
              source: 'event',
              target: 'event.production.targeted',
              operation: 'multiply',
              value: effect.value,
              sourceId: event.id,
              subTarget: effect.target,
              description: `Event: ${effect.value}x production for ${effect.target}`,
            });
          } else {
            modifiers.push({
              id: `${baseId}:global`,
              source: 'event',
              target: 'event.production.global',
              operation: 'multiply',
              value: effect.value,
              sourceId: event.id,
              description: `Event: ${effect.value}x global production`,
            });
          }
          break;
        case 'powerMultiplier':
          modifiers.push({
            id: `${baseId}:power`,
            source: 'event',
            target: 'event.power',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x power consumption`,
          });
          break;
        case 'researchSpeed':
          modifiers.push({
            id: `${baseId}:research`,
            source: 'event',
            target: 'event.research',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x research speed`,
          });
          break;
        case 'marketPriceMultiplier':
          modifiers.push({
            id: `${baseId}:market`,
            source: 'event',
            target: 'market.sellPrice',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x market prices`,
          });
          break;
        case 'transportSpeed':
          modifiers.push({
            id: `${baseId}:transport`,
            source: 'event',
            target: 'transport.throughput',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x transport speed`,
          });
          break;
      }
    }
  }

  return modifiers;
}

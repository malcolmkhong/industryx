import { EVENT_ARCHETYPES, type EventArchetype } from "./archetypeDefinitions";
import { RESOURCE_META } from "../config/configCache";
import type { ResourceType } from "../shared/types/types";
import { getResourceName, getSectorName } from "./eventRandom";

export function resolveArchetype(archetype: EventArchetype, pool: ResourceType[]) {
  const resources = archetype.selectResources(pool);
  const effects = resources.map((r, i) => ({
    type: 'marketPriceMultiplier' as const,
    value: archetype.generateMultiplier(r, i, resources.length),
    target: r,
  }));

  const tier = resources.length > 0 ? RESOURCE_META[resources[0]]?.tier : null;

  const name = archetype.namePattern
    .replace('{name}', resources.length > 0 ? getResourceName(resources[0]) : 'Resource')
    .replace('{sector}', getSectorName(resources))
    .replace('{tier}', tier != null ? `T${tier}` : '?');

  const description = archetype.descriptionPattern;

  return { name, description, effects, resources, icon: archetype.icon, direction: archetype.direction };
}

export function pickRandomArchetype(): EventArchetype {
  const total = EVENT_ARCHETYPES.reduce((s, a) => s + a.weight, 0);
  let roll = Math.random() * total;
  for (const a of EVENT_ARCHETYPES) {
    roll -= a.weight;
    if (roll <= 0) return a;
  }
  return EVENT_ARCHETYPES[0];
}

// Weather state → Modifier[] adapter.

import type { Modifier } from "../types";

/** Create weather modifiers from current WeatherState */
export function weatherToModifiers(
  weather: {
    current: string;
    intensity: number;
  },
  weatherDefs: Record<string, {
    productionMultiplier: number;
    solarMultiplier: number;
    windMultiplier: number;
  }>
): Modifier[] {
  const def = weatherDefs[weather.current];
  if (!def) return [];

  return [
    {
      id: `weather:${weather.current}:production`,
      source: 'weather',
      target: 'weather.production',
      operation: 'override',
      value: def.productionMultiplier,
      sourceId: weather.current,
      description: `Weather ${weather.current}: ${def.productionMultiplier}x production`,
    },
    {
      id: `weather:${weather.current}:solar`,
      source: 'weather',
      target: 'weather.solar',
      operation: 'override',
      value: def.solarMultiplier,
      sourceId: weather.current,
      description: `Weather ${weather.current}: ${def.solarMultiplier}x solar`,
    },
    {
      id: `weather:${weather.current}:wind`,
      source: 'weather',
      target: 'weather.wind',
      operation: 'override',
      value: def.windMultiplier,
      sourceId: weather.current,
      description: `Weather ${weather.current}: ${def.windMultiplier}x wind`,
    },
  ];
}

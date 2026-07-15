import type { SupabaseWeather } from "../types/supabaseRows";
import type { GameConfig } from "../types/gameConfig";

export function transformWeather(weather: SupabaseWeather[]): GameConfig['weather'] {
  const result: GameConfig['weather'] = {};
  for (const w of weather) {
    result[w.id] = {
      name: w.name,
      icon: w.icon,
      productionMultiplier: w.production_multiplier,
      solarMultiplier: w.solar_multiplier,
      windMultiplier: w.wind_multiplier,
      description: w.description,
    };
  }
  return result;
}

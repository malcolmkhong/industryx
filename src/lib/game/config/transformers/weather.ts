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
      // transportMultiplier is optional in older rows; fall back to
      // 1.0 when the column is missing so older game_config_weather
      // payloads keep working.
      transportMultiplier:
        typeof w.transport_multiplier === "number"
          ? w.transport_multiplier
          : 1.0,
      description: w.description,
    };
  }
  return result;
}

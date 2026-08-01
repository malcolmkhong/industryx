import { requireDbClient } from "@/lib/db/access";
import {
  parseGlobalWeatherState,
  type GlobalWeatherState,
} from "@/lib/game/weather/shared/globalWeather";

const GLOBAL_WEATHER_COLUMNS =
  "current_weather,intensity,started_at,next_change_at";

/**
 * Reads the singleton shared-weather state. The database is authoritative;
 * unavailable or malformed weather is an operational failure, never a local
 * weather fallback.
 */
export async function loadGlobalWeatherState(): Promise<GlobalWeatherState> {
  const { data, error } = await requireDbClient()
    .from("server_weather_state")
    .select(GLOBAL_WEATHER_COLUMNS)
    .eq("id", 1)
    .single();

  if (error || !data) {
    throw new Error(
      `[globalWeather] shared weather unavailable: ${error?.message ?? "singleton row missing"}`,
    );
  }

  const weather = parseGlobalWeatherState(data);
  if (!weather) {
    throw new Error("[globalWeather] shared weather row is malformed");
  }

  return weather;
}

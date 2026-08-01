import type { WeatherState, WeatherType } from "@/lib/game/shared/types/production";

export interface GlobalWeatherState {
  current: WeatherType;
  intensity: number;
  startedAt: string;
  nextChangeAt: string;
}

const WEATHER_TYPES = new Set<WeatherType>([
  "clear",
  "rainy",
  "stormy",
  "sunny",
  "foggy",
  "snowy",
]);

/** Validates the shared weather row at a database or HTTP trust boundary. */
export function parseGlobalWeatherState(value: unknown): GlobalWeatherState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const startedAtText = row.started_at;
  const nextChangeAtText = row.next_change_at;
  if (typeof startedAtText !== "string" || typeof nextChangeAtText !== "string") {
    return null;
  }

  const startedAt = Date.parse(startedAtText);
  const nextChangeAt = Date.parse(nextChangeAtText);
  if (
    typeof row.current_weather !== "string" ||
    !WEATHER_TYPES.has(row.current_weather as WeatherType) ||
    typeof row.intensity !== "number" ||
    !Number.isFinite(row.intensity) ||
    row.intensity < 0 ||
    row.intensity > 1 ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(nextChangeAt) ||
    nextChangeAt <= startedAt
  ) {
    return null;
  }

  return {
    current: row.current_weather as WeatherType,
    intensity: row.intensity,
    startedAt: startedAtText,
    nextChangeAt: nextChangeAtText,
  };
}

/**
 * Projects shared server weather into a player's canonical state before an
 * authoritative tick. Countdown fields are deliberately zeroed: global
 * weather is timed by server timestamps, never by an individual player tick.
 */
export function projectGlobalWeather(
  _weather: WeatherState,
  globalWeather: GlobalWeatherState,
): WeatherState {
  return {
    current: globalWeather.current,
    intensity: globalWeather.intensity,
    remaining: 0,
    nextChange: 0,
  };
}

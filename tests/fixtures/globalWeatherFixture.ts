import type { GlobalWeatherState } from "@/lib/game/weather/shared/globalWeather";

/** Explicit shared weather input for server-tick unit tests. */
export const TEST_GLOBAL_WEATHER: GlobalWeatherState = {
  current: "clear",
  intensity: 1,
  startedAt: "2026-01-01T00:00:00.000Z",
  nextChangeAt: "2026-01-01T00:30:00.000Z",
};

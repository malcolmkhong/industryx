import { describe, expect, it } from "vitest";
import { projectGlobalWeather, parseGlobalWeatherState } from "@/lib/game/weather/shared/globalWeather";

describe("global weather projection", () => {
  it("replaces a player's stale weather with the active shared weather", () => {
    const weather = parseGlobalWeatherState({
      current_weather: "stormy",
      intensity: 0.7,
      started_at: "2026-07-19T00:00:00.000Z",
      next_change_at: "2026-07-19T00:45:00.000Z",
    });
    expect(weather).not.toBeNull();
    expect(projectGlobalWeather({ current: "clear", intensity: 0, remaining: 200, nextChange: 200 }, weather!)).toEqual({
      current: "stormy", intensity: 0.7, remaining: 0, nextChange: 0,
    });
  });
});

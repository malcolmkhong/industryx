import { describe, expect, it } from "vitest";
import {
  parseGlobalWeatherSchedule,
  parseWeatherConfigRows,
  selectNextGlobalWeather,
} from "../../cloudflare/markettick/shared/globalWeatherScheduler.js";

describe("global weather scheduler", () => {
  it("uses only configured weather, avoids immediate repeats, and honours server schedule bounds", () => {
    const schedule = parseGlobalWeatherSchedule({
      min_duration_seconds: 1800,
      max_duration_seconds: 3600,
      min_intensity: 0.3,
      max_intensity: 1,
    });
    const weatherIds = parseWeatherConfigRows([{ id: "clear" }, { id: "stormy" }]);

    expect(schedule).not.toBeNull();
    expect(weatherIds).toEqual(["clear", "stormy"]);

    const next = selectNextGlobalWeather({
      currentWeather: "clear",
      weatherIds: weatherIds!,
      schedule: schedule!,
      nowMs: Date.parse("2026-07-19T00:00:00.000Z"),
      random: () => 0,
    });

    expect(next.current).toBe("stormy");
    expect(next.intensity).toBe(0.3);
    expect(next.startedAt).toBe("2026-07-19T00:00:00.000Z");
    expect(next.nextChangeAt).toBe("2026-07-19T00:30:00.000Z");
  });

  it("rejects malformed schedule values instead of scheduling with defaults", () => {
    expect(parseGlobalWeatherSchedule({
      min_duration_seconds: 1200,
      max_duration_seconds: 3600,
      min_intensity: 0.3,
      max_intensity: 1,
    })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { transformWeather } from "@/lib/game/config/transformers/weather";

describe("weather configuration transform", () => {
  it("preserves the server-configured transport multiplier", () => {
    const weatherRows = [
      {
        id: "rainy",
        name: "Rainy",
        icon: "cloud-rain",
        production_multiplier: 0.9,
        solar_multiplier: 0.3,
        wind_multiplier: 1.2,
        transport_multiplier: 0.9,
        description: "Reduced visibility and wet roads.",
        sort_order: 3,
      },
    ];

    expect(transformWeather(weatherRows)).toEqual({
      rainy: {
        name: "Rainy",
        icon: "cloud-rain",
        productionMultiplier: 0.9,
        solarMultiplier: 0.3,
        windMultiplier: 1.2,
        transportMultiplier: 0.9,
        description: "Reduced visibility and wet roads.",
      },
    });
  });
});

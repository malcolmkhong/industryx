// Server-side weather tick mutation.
//
// Extracted from runServerTicks so weather rotation can be unit-tested in
// isolation. Mutates the weather slice in place (caller clones state first).
// When `remaining` reaches zero, picks a new weather type uniformly at random
// and resets the countdown.
//
// CRIT-2 fix (2026-07-14): the previous Math.random() calls made this
// path non-cryptographic and non-deterministic. Two concurrent server
// invocations for the same user (live-tick + offline-progress racing)
// could produce different weather, and a sufficiently motivated client
// could in principle infer the PRNG state. Replaced with the
// `serverRandom` helper (crypto.getRandomValues-backed).

import {
  secureRandomFloat,
  secureRandomInt,
  secureRandomIntInRange,
} from "../util/serverRandom";
import type {
  ServerGameData,
  WeatherType,
} from "../../../shared/types/types";

const WEATHER_TYPES: WeatherType[] = [
  "clear",
  "rainy",
  "stormy",
  "sunny",
  "foggy",
  "snowy",
];

export function advanceWeatherTick(state: ServerGameData): void {
  state.weather.remaining -= 1;
  if (state.weather.remaining <= 0) {
    state.weather.remaining = secureRandomIntInRange(100, 300);
    const weatherType = WEATHER_TYPES[secureRandomInt(WEATHER_TYPES.length)];
    if (weatherType === undefined) {
      throw new Error("[advanceWeatherTick] WEATHER_TYPES index out of range");
    }
    state.weather.current = weatherType;
    state.weather.intensity = 0.3 + secureRandomFloat() * 0.7;
  }
}
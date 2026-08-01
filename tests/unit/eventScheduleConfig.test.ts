import { describe, expect, it } from "vitest";

import { parseEventScheduleConfig } from "@/lib/game/config/server/eventScheduleConfig";

describe("event schedule configuration", () => {
  it("accepts a complete, finite factory-event schedule from server config", () => {
    expect(
      parseEventScheduleConfig({
        event_trigger_interval: 600,
        event_trigger_chance: 0.4,
        max_concurrent_events: 1,
      }),
    ).toEqual({
      ok: true,
      value: {
        triggerIntervalTicks: 600,
        triggerChance: 0.4,
        maxConcurrentEvents: 1,
      },
    });
  });

  it.each([
    undefined,
    {},
    {
      event_trigger_interval: Number.NaN,
      event_trigger_chance: 0.4,
      max_concurrent_events: 1,
    },
    {
      event_trigger_interval: 600.5,
      event_trigger_chance: 0.4,
      max_concurrent_events: 1,
    },
    {
      event_trigger_interval: 600,
      event_trigger_chance: 1.01,
      max_concurrent_events: 1,
    },
    {
      event_trigger_interval: 600,
      event_trigger_chance: 0.4,
      max_concurrent_events: 0,
    },
  ])("rejects malformed schedule config: %o", (rawConfig) => {
    expect(parseEventScheduleConfig(rawConfig)).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });
});

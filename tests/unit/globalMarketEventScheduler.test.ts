import { describe, expect, it } from "vitest";
import {
  advanceGlobalMarketEvent,
  buildGlobalMarketPriceMultipliers,
} from "../../cloudflare/markettick/shared/globalMarketEventScheduler.js";

const templates = [
  {
    id: "oilCrisis",
    name: "Oil Crisis",
    description: "Oil supply disruption.",
    icon: "game-icons:oil-rig",
    scope: "global_market",
    selection_weight: 1,
    duration_unit: "seconds",
    duration_min: 1800,
    duration_max: 5400,
    is_active: true,
    effects: [{ id: "oil", type: "marketPriceMultiplier", target: "oil", value: 2.5 }],
  },
];

const schedule = {
  checkIntervalSeconds: 1800,
  triggerChance: 0.2,
  cooldownSeconds: 1800,
};

describe("global market event scheduler", () => {
  it("creates one configured event at a due check and preserves its server window", () => {
    const result = advanceGlobalMarketEvent({
      activeEvent: null,
      cooldownUntil: null,
      nextCheckAt: "2026-07-19T00:00:00.000Z",
      templates,
      schedule,
      nowMs: Date.parse("2026-07-19T00:00:00.000Z"),
      random: () => 0,
    });

    expect(result.activeEvent).toMatchObject({
      templateId: "oilCrisis",
      startedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-07-19T00:30:00.000Z",
    });
    expect(result.cooldownUntil).toBeNull();
    expect(result.nextCheckAt).toBe("2026-07-19T00:30:00.000Z");
  });

  it("expires an event, starts the configured cooldown, and does not stack another event", () => {
    const result = advanceGlobalMarketEvent({
      activeEvent: {
        templateId: "oilCrisis",
        name: "Oil Crisis",
        description: "Oil supply disruption.",
        icon: "game-icons:oil-rig",
        effects: templates[0].effects,
        startedAt: "2026-07-19T00:00:00.000Z",
        expiresAt: "2026-07-19T00:30:00.000Z",
      },
      cooldownUntil: null,
      nextCheckAt: "2026-07-19T00:30:00.000Z",
      templates,
      schedule,
      nowMs: Date.parse("2026-07-19T00:30:00.000Z"),
      random: () => 0,
    });

    expect(result.activeEvent).toBeNull();
    expect(result.cooldownUntil).toBe("2026-07-19T01:00:00.000Z");
    expect(result.nextCheckAt).toBe("2026-07-19T01:00:00.000Z");
  });

  it("does not create an event when the configured chance fails", () => {
    const result = advanceGlobalMarketEvent({
      activeEvent: null,
      cooldownUntil: null,
      nextCheckAt: "2026-07-19T00:00:00.000Z",
      templates,
      schedule,
      nowMs: Date.parse("2026-07-19T00:00:00.000Z"),
      random: () => 0.2,
    });

    expect(result.activeEvent).toBeNull();
    expect(result.nextCheckAt).toBe("2026-07-19T00:30:00.000Z");
  });

  it("returns finite per-resource quote multipliers only for a currently active event", () => {
    expect(buildGlobalMarketPriceMultipliers({
      templateId: "oilCrisis",
      name: "Oil Crisis",
      description: "Oil supply disruption.",
      icon: "game-icons:oil-rig",
      effects: templates[0].effects,
      startedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-07-19T00:30:00.000Z",
    }, Date.parse("2026-07-19T00:15:00.000Z"))).toEqual({ oil: 2.5 });

    expect(buildGlobalMarketPriceMultipliers({
      templateId: "oilCrisis",
      name: "Oil Crisis",
      description: "Oil supply disruption.",
      icon: "game-icons:oil-rig",
      effects: [{ id: "bad", type: "marketPriceMultiplier", target: "oil", value: Number.NaN }],
      startedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-07-19T00:30:00.000Z",
    }, Date.parse("2026-07-19T00:15:00.000Z"))).toEqual({});
  });
});

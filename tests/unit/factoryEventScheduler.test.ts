import { describe, expect, it } from "vitest";

import {
  advanceFactoryEvents,
  advanceFactoryEventLifecycle,
  getFactoryEventRemaining,
  parseFactoryEventTemplates,
  type FactoryEventSchedule,
  type FactoryEventTemplate,
} from "@/lib/game/events/server/factoryEventScheduler";

const SCHEDULE: FactoryEventSchedule = {
  triggerIntervalTicks: 600,
  triggerChance: 0.4,
  maxConcurrentEvents: 1,
};

const TEMPLATE: FactoryEventTemplate = {
  id: "energyShortage",
  name: "Energy Shortage",
  description: "Local power equipment is inefficient.",
  icon: "game-icons:lightning-storm",
  selectionWeight: 1,
  durationMin: 600,
  durationMax: 1200,
  repeatCooldownChecks: 3,
  effects: [
    { id: "energyShortage-effect-0", type: "powerMultiplier", value: 1.3 },
  ],
};

describe("factory event scheduler", () => {
  it("expires an existing factory event even when scheduling is unavailable", () => {
    const state = {
      gameTick: 601,
      activeEvents: [
        {
          id: "factory:energyShortage:600",
          templateId: "energyShortage",
          scope: "factory" as const,
          type: "energyShortage",
          name: "Energy Shortage",
          description: "Local power equipment is inefficient.",
          duration: 600,
          remaining: 1,
          effects: TEMPLATE.effects,
          icon: TEMPLATE.icon,
        },
      ],
      eventLog: [],
    };

    advanceFactoryEventLifecycle(state);

    expect(state.activeEvents).toEqual([]);
    expect(state.eventLog).toEqual([expect.objectContaining({ remaining: 0 })]);
  });

  it("accepts only complete factory templates with factory-safe effects", () => {
    expect(
      parseFactoryEventTemplates([
        {
          ...TEMPLATE,
          scope: "factory",
          durationUnit: "ticks",
          isActive: true,
        },
      ]),
    ).toEqual({
      ok: true,
      value: [TEMPLATE],
    });

    expect(
      parseFactoryEventTemplates([
        {
          ...TEMPLATE,
          scope: "factory",
          durationUnit: "ticks",
          isActive: true,
          effects: [{ ...TEMPLATE.effects[0], type: "marketPriceMultiplier" }],
        },
      ]),
    ).toEqual(expect.objectContaining({ ok: false }));

    expect(
      parseFactoryEventTemplates([
        {
          ...TEMPLATE,
          scope: "factory",
          durationUnit: "ticks",
          isActive: false,
        },
      ]),
    ).toEqual({ ok: true, value: [] });
  });

  it("creates one factory event only at an eligible server tick", () => {
    const state = { gameTick: 600, activeEvents: [], eventLog: [] };

    advanceFactoryEvents(state, SCHEDULE, [TEMPLATE], () => 0);

    expect(state.activeEvents).toEqual([
      expect.objectContaining({
        id: "factory:energyShortage:600",
        templateId: "energyShortage",
        scope: "factory",
        duration: 600,
        remaining: 600,
      }),
    ]);
  });

  it("expires a factory event into history without starting another during its cooldown", () => {
    const state = {
      gameTick: 1200,
      activeEvents: [
        {
          id: "factory:energyShortage:600",
          templateId: "energyShortage",
          scope: "factory" as const,
          startedAtTick: 600,
          scheduleCheck: 1,
          type: "energyShortage",
          name: "Energy Shortage",
          description: "Local power equipment is inefficient.",
          duration: 600,
          remaining: 1,
          effects: TEMPLATE.effects,
          icon: TEMPLATE.icon,
        },
      ],
      eventLog: [],
    };

    advanceFactoryEvents(state, SCHEDULE, [TEMPLATE], () => 0);

    expect(state.activeEvents).toEqual([]);
    expect(state.eventLog).toEqual([
      expect.objectContaining({
        id: "factory:energyShortage:600",
        remaining: 0,
      }),
    ]);
  });

  it("allows a different eligible template after the final active event expires", () => {
    const otherTemplate: FactoryEventTemplate = {
      ...TEMPLATE,
      id: "naturalDisaster",
    };
    const state = {
      gameTick: 1200,
      activeEvents: [
        {
          id: "factory:energyShortage:600",
          templateId: "energyShortage",
          scope: "factory" as const,
          startedAtTick: 600,
          scheduleCheck: 1,
          type: "energyShortage",
          name: "Energy Shortage",
          description: "Local power equipment is inefficient.",
          duration: 600,
          remaining: 1,
          effects: TEMPLATE.effects,
          icon: TEMPLATE.icon,
        },
      ],
      eventLog: [],
    };

    advanceFactoryEvents(state, SCHEDULE, [TEMPLATE, otherTemplate], () => 0);

    expect(state.activeEvents).toEqual([
      expect.objectContaining({ templateId: "naturalDisaster" }),
    ]);
  });

  it("uses configured weights when selecting eligible factory templates", () => {
    const weightedTemplate: FactoryEventTemplate = {
      ...TEMPLATE,
      id: "techBreakthrough",
      selectionWeight: 3,
    };
    const state = { gameTick: 600, activeEvents: [], eventLog: [] };

    const rolls = [0, 0.8, 0];
    advanceFactoryEvents(
      state,
      SCHEDULE,
      [TEMPLATE, weightedTemplate],
      () => rolls.shift() ?? 0,
    );

    expect(state.activeEvents[0]).toEqual(
      expect.objectContaining({ templateId: "techBreakthrough" }),
    );
  });
});

describe("Phase 8 — endsAtTick + getFactoryEventRemaining", () => {
  it("schedules a new event with endsAtTick = startedAtTick + duration", () => {
    const state = { gameTick: 600, activeEvents: [], eventLog: [] };
    advanceFactoryEvents(state, SCHEDULE, [TEMPLATE], () => 0);
    expect(state.activeEvents).toHaveLength(1);
    const event = state.activeEvents[0] as {
      startedAtTick: number;
      duration: number;
      endsAtTick: number;
    };
    expect(event.startedAtTick).toBe(600);
    expect(event.duration).toBeGreaterThan(0);
    expect(event.endsAtTick).toBe(event.startedAtTick + event.duration);
  });

  it("derives remaining from endsAtTick using the current gameTick", () => {
    const event = {
      id: "factory:energyShortage:600",
      templateId: "energyShortage",
      scope: "factory" as const,
      type: "energyShortage",
      name: "Energy Shortage",
      description: "...",
      duration: 600,
      remaining: 600,
      startedAtTick: 600,
      endsAtTick: 1200,
      effects: TEMPLATE.effects,
      icon: TEMPLATE.icon,
    };
    expect(getFactoryEventRemaining(event, 600)).toBe(600);
    expect(getFactoryEventRemaining(event, 900)).toBe(300);
    expect(getFactoryEventRemaining(event, 1200)).toBe(0);
    expect(getFactoryEventRemaining(event, 9999)).toBe(0);
  });

  it("falls back to the stored `remaining` when endsAtTick is missing", () => {
    const event = {
      id: "legacy",
      templateId: "energyShortage",
      type: "energyShortage",
      name: "Energy Shortage",
      description: "...",
      duration: 600,
      remaining: 123,
      effects: TEMPLATE.effects,
      icon: TEMPLATE.icon,
    };
    expect(getFactoryEventRemaining(event, 9999)).toBe(123);
  });

  it("clamps a non-finite endsAtTick to fall back to `remaining`", () => {
    const event = {
      id: "weird",
      templateId: "energyShortage",
      type: "energyShortage",
      name: "Energy Shortage",
      description: "...",
      duration: 600,
      remaining: 50,
      endsAtTick: Number.NaN,
      effects: TEMPLATE.effects,
      icon: TEMPLATE.icon,
    };
    expect(getFactoryEventRemaining(event, 9999)).toBe(50);
  });

  it("returns 0 when neither endsAtTick nor remaining is finite", () => {
    const event = {
      id: "broken",
      templateId: "energyShortage",
      type: "energyShortage",
      name: "Energy Shortage",
      description: "...",
      duration: 600,
      remaining: Number.NaN,
      effects: TEMPLATE.effects,
      icon: TEMPLATE.icon,
    };
    expect(getFactoryEventRemaining(event, 9999)).toBe(0);
  });
});

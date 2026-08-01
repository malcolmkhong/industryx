import type { EventEffect, GameEvent } from "@/lib/game/shared/types/types";

export interface FactoryEventSchedule {
  triggerIntervalTicks: number;
  triggerChance: number;
  maxConcurrentEvents: number;
}

export interface FactoryEventTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  selectionWeight: number;
  durationMin: number;
  durationMax: number;
  repeatCooldownChecks: number;
  effects: EventEffect[];
}

export type FactoryEventTemplateParseResult =
  | { ok: true; value: FactoryEventTemplate[] }
  | { ok: false; reason: string };

type FactoryTemplateParseResult =
  | { ok: true; value: FactoryEventTemplate }
  | { ok: false; reason: string };

export function advanceFactoryEventLifecycle(state: FactoryEventState): void {
  const remainingEvents: GameEvent[] = [];

  for (const event of state.activeEvents) {
    if (!isFactoryEvent(event)) {
      remainingEvents.push(event);
      continue;
    }

    const remaining = event.remaining - 1;
    if (remaining > 0) {
      remainingEvents.push({ ...event, remaining });
      continue;
    }

    state.eventLog.push({ ...event, remaining: 0 });
  }
  state.activeEvents = remainingEvents;
}

export function parseFactoryEventTemplates(
  rawTemplates: unknown,
): FactoryEventTemplateParseResult {
  if (!Array.isArray(rawTemplates)) {
    return { ok: false, reason: "event templates must be an array" };
  }

  const templates: FactoryEventTemplate[] = [];
  for (const rawTemplate of rawTemplates) {
    if (!isRecord(rawTemplate)) {
      return { ok: false, reason: "event template must be an object" };
    }
    if (rawTemplate.scope !== "factory") continue;
    if (typeof rawTemplate.isActive !== "boolean") {
      return { ok: false, reason: "factory event isActive must be a boolean" };
    }
    if (!rawTemplate.isActive) continue;

    const parsed = parseFactoryTemplate(rawTemplate);
    if (!parsed.ok) return parsed;
    templates.push(parsed.value);
  }

  return { ok: true, value: templates };
}

function parseFactoryTemplate(
  raw: Record<string, unknown>,
): FactoryTemplateParseResult {
  const id = raw.id;
  const name = raw.name;
  const description = raw.description;
  const icon = raw.icon;
  if (!isNonEmptyString(id) || !isNonEmptyString(name) || !isNonEmptyString(description) || !isNonEmptyString(icon)) {
    return { ok: false, reason: "factory event id, name, description, and icon must be non-empty strings" };
  }

  if (raw.durationUnit !== "ticks") {
    return { ok: false, reason: "factory event durationUnit must be ticks" };
  }

  const selectionWeight = raw.selectionWeight;
  const durationMin = raw.durationMin;
  const durationMax = raw.durationMax;
  const repeatCooldownChecks = raw.repeatCooldownChecks;
  if (!isPositiveSafeInteger(selectionWeight)) {
    return { ok: false, reason: "factory event selectionWeight must be a positive safe integer" };
  }
  if (!isPositiveSafeInteger(durationMin) || !isPositiveSafeInteger(durationMax) || durationMax < durationMin) {
    return { ok: false, reason: "factory event duration bounds must be ordered positive safe integers" };
  }
  if (!isNonNegativeSafeInteger(repeatCooldownChecks)) {
    return { ok: false, reason: "factory event repeatCooldownChecks must be a non-negative safe integer" };
  }
  if (!Array.isArray(raw.effects)) {
    return { ok: false, reason: "factory event effects must be an array" };
  }

  const effects: EventEffect[] = [];
  for (const effect of raw.effects) {
    if (!isRecord(effect) || !isFactoryEffect(effect)) {
      return { ok: false, reason: "factory event has an invalid or non-factory effect" };
    }
    effects.push({
      id: effect.id,
      type: effect.type,
      ...(typeof effect.target === "string" ? { target: effect.target } : {}),
      value: effect.value,
    });
  }

  return {
    ok: true,
    value: {
      id,
      name,
      description,
      icon,
      selectionWeight,
      durationMin,
      durationMax,
      repeatCooldownChecks,
      effects,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFactoryEffect(
  effect: Record<string, unknown>,
): effect is { id: string; type: EventEffect["type"]; target?: string; value: number } {
  return typeof effect.id === "string"
    && typeof effect.value === "number"
    && Number.isFinite(effect.value)
    && effect.value > 0
    && (effect.type === "productionMultiplier"
      || effect.type === "powerMultiplier"
      || effect.type === "transportSpeed"
      || effect.type === "researchSpeed");
}

type FactoryEventState = {
  gameTick: number;
  activeEvents: GameEvent[];
  eventLog: GameEvent[];
  money?: number;
  totalMoneyEarned?: number;
};

export function advanceFactoryEvents(
  state: FactoryEventState,
  schedule: FactoryEventSchedule,
  templates: FactoryEventTemplate[],
  nextRandom: () => number = createDeterministicEventRandom(state),
): void {
  advanceFactoryEventLifecycle(state);
  scheduleFactoryEvent(state, schedule, templates, nextRandom);
}

export function scheduleFactoryEvent(
  state: FactoryEventState,
  schedule: FactoryEventSchedule,
  templates: FactoryEventTemplate[],
  nextRandom: () => number,
): void {

  if (state.gameTick % schedule.triggerIntervalTicks !== 0) return;
  if (state.activeEvents.filter(isFactoryEvent).length >= schedule.maxConcurrentEvents) return;
  if (nextRandom() >= schedule.triggerChance) return;

  const scheduleCheck = state.gameTick / schedule.triggerIntervalTicks;
  const eligibleTemplates = templates.filter((template) =>
    isEligible(template, state.eventLog, scheduleCheck),
  );
  const selected = chooseWeighted(eligibleTemplates, nextRandom());
  if (!selected) return;

  const duration = randomInclusive(
    selected.durationMin,
    selected.durationMax,
    nextRandom(),
  );
  state.activeEvents.push({
    id: `factory:${selected.id}:${state.gameTick}`,
    templateId: selected.id,
    scope: "factory",
    startedAtTick: state.gameTick,
    // Phase 8: server-anchored target tick for the countdown. Allows
    // the client to compute `remaining = endsAtTick - gameTick` between
    // server pushes (per-second display) without a server round-trip.
    endsAtTick: state.gameTick + duration,
    scheduleCheck,
    type: selected.id,
    name: selected.name,
    description: selected.description,
    duration,
    remaining: duration,
    effects: selected.effects,
    icon: selected.icon,
  });
}

/**
 * Phase 8: derive the current remaining-ticks for a factory event.
 * Prefers `endsAtTick` (server-anchored, can be locally interpolated)
 * and falls back to the stored `remaining` for legacy events that
 * were persisted before endsAtTick was added.
 *
 * @param currentTick Current gameTick (from the live store).
 * @returns Non-negative integer ticks remaining. 0 means the event
 *   has ended locally; the server will drop it on the next push.
 */
export function getFactoryEventRemaining(event: GameEvent, currentTick: number): number {
  if (typeof event.endsAtTick === "number" && Number.isFinite(event.endsAtTick)) {
    return Math.max(0, Math.floor(event.endsAtTick - currentTick));
  }
  if (typeof event.remaining === "number" && Number.isFinite(event.remaining)) {
    return Math.max(0, Math.floor(event.remaining));
  }
  return 0;
}

function isFactoryEvent(event: GameEvent): boolean {
  return event.scope === "factory" || event.scope === undefined;
}

function isEligible(
  template: FactoryEventTemplate,
  eventLog: GameEvent[],
  currentCheck: number,
): boolean {
  const lastOccurrence = [...eventLog]
    .reverse()
    .find((event) => event.scope === "factory" && event.templateId === template.id);
  if (!lastOccurrence || lastOccurrence.scheduleCheck === undefined) return true;

  return currentCheck - lastOccurrence.scheduleCheck > template.repeatCooldownChecks;
}

function chooseWeighted(
  templates: FactoryEventTemplate[],
  roll: number,
): FactoryEventTemplate | null {
  const totalWeight = templates.reduce((sum, template) => sum + template.selectionWeight, 0);
  if (totalWeight <= 0) return null;

  let threshold = roll * totalWeight;
  for (const template of templates) {
    threshold -= template.selectionWeight;
    if (threshold < 0) return template;
  }
  return templates.at(-1) ?? null;
}

function randomInclusive(min: number, max: number, roll: number): number {
  return min + Math.floor(roll * (max - min + 1));
}

function createDeterministicEventRandom(state: FactoryEventState): () => number {
  let value = hashSeed([
    state.gameTick,
    state.money ?? 0,
    state.totalMoneyEarned ?? 0,
    state.eventLog.at(-1)?.id ?? "",
  ].join("|"));

  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

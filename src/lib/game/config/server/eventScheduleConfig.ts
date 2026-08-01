// ============================================
// INDUSTRIAX: Event Schedule Config Validation
// Server-side trust boundary for the event cadence fields stored in
// game_config_game. Event scheduling is not activated by this module.
// ============================================

export interface EventScheduleConfig {
  triggerIntervalTicks: number;
  triggerChance: number;
  maxConcurrentEvents: number;
}

export type EventScheduleConfigParseResult =
  | { ok: true; value: EventScheduleConfig }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(reason: string): EventScheduleConfigParseResult {
  return { ok: false, reason };
}

/**
 * Parses the event cadence values at the server configuration boundary.
 *
 * There are deliberately no fallback balance values here. A future
 * authoritative scheduler must refuse to run when this result is invalid.
 */
export function parseEventScheduleConfig(
  rawConfig: unknown,
): EventScheduleConfigParseResult {
  if (!isRecord(rawConfig)) {
    return invalid("game_config_game row is missing or not an object");
  }

  const interval = Reflect.get(rawConfig, "event_trigger_interval");
  if (typeof interval !== "number" || !Number.isSafeInteger(interval) || interval <= 0) {
    return invalid("event_trigger_interval must be a positive safe integer");
  }

  const chance = Reflect.get(rawConfig, "event_trigger_chance");
  if (typeof chance !== "number" || !Number.isFinite(chance) || chance < 0 || chance > 1) {
    return invalid("event_trigger_chance must be a finite number between 0 and 1");
  }

  const maxConcurrentEvents = Reflect.get(rawConfig, "max_concurrent_events");
  if (
    typeof maxConcurrentEvents !== "number" ||
    !Number.isSafeInteger(maxConcurrentEvents) ||
    maxConcurrentEvents <= 0
  ) {
    return invalid("max_concurrent_events must be a positive safe integer");
  }

  return {
    ok: true,
    value: {
      triggerIntervalTicks: interval,
      triggerChance: chance,
      maxConcurrentEvents,
    },
  };
}

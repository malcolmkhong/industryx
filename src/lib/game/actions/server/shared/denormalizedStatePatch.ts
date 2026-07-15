import type { Json } from "@/lib/db/types";

interface DenormalizedStateFallback {
  buildings: unknown;
  completed_research: unknown;
  game_tick: unknown;
  money: unknown;
  research_points: unknown;
  resources: unknown;
  total_money_earned: unknown;
  workers: unknown;
}

export interface DenormalizedStatePatchFields {
  buildings: Json;
  buildings_count: number;
  completed_research: Json;
  game_tick: number;
  money: number;
  research_points: number;
  resources: Json;
  total_money_earned: number;
  workers: Json;
}

function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value === null || typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJson);
  }

  if (typeof value === "object") {
    return Object.values(value).every(
      (nested) => nested === undefined || isJson(nested),
    );
  }

  return false;
}

function finiteNumberOr(value: unknown, fallback: unknown): number {
  const next = Number(value);
  if (Number.isFinite(next)) return next;

  const previous = Number(fallback);
  return Number.isFinite(previous) ? previous : 0;
}

function jsonArrayOr(value: unknown, fallback: unknown): Json {
  if (Array.isArray(value) && isJson(value)) return value;
  if (Array.isArray(fallback) && isJson(fallback)) return fallback;
  return [];
}

function jsonObjectOr(value: unknown, fallback: unknown): Json {
  if (value && typeof value === "object" && !Array.isArray(value) && isJson(value)) {
    return value;
  }
  if (
    fallback &&
    typeof fallback === "object" &&
    !Array.isArray(fallback) &&
    isJson(fallback)
  ) {
    return fallback;
  }
  return {};
}

export function buildDenormalizedStatePatchFields(
  state: Record<string, unknown>,
  fallback: DenormalizedStateFallback,
): DenormalizedStatePatchFields {
  const buildings = jsonArrayOr(state.buildings, fallback.buildings);

  return {
    buildings,
    buildings_count: Array.isArray(buildings) ? buildings.length : 0,
    completed_research: jsonArrayOr(
      state.completedResearch,
      fallback.completed_research,
    ),
    game_tick: finiteNumberOr(state.gameTick, fallback.game_tick),
    money: finiteNumberOr(state.money, fallback.money),
    research_points: finiteNumberOr(
      state.researchPoints,
      fallback.research_points,
    ),
    resources: jsonObjectOr(state.resources, fallback.resources),
    total_money_earned: finiteNumberOr(
      state.totalMoneyEarned,
      fallback.total_money_earned,
    ),
    workers: jsonArrayOr(state.workers, fallback.workers),
  };
}

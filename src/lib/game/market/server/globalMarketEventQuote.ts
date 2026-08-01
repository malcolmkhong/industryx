import { utcMsToTick, type WorldClock } from "@/lib/utils/time";

export interface GlobalMarketEventEffect {
  id: string;
  type: "marketPriceMultiplier";
  target: string;
  value: number;
}

export interface ActiveGlobalMarketEvent {
  templateId: string;
  name: string;
  description: string;
  icon: string;
  effects: GlobalMarketEventEffect[];
  startedAt: string;
  expiresAt: string;
  /**
   * Server-anchored gameTick at which the event expires. Derived from
   * `expiresAt` ISO via the canonical world clock so the client can show
   * per-second countdowns without depending on the player's local clock.
   * 0 means the event has just expired (nowMs ≥ expiresAt) — the event
   * is over and effects are no longer applied.
   */
  endsAtTick: number;
  /**
   * Present iff the world clock derivation failed for this event
   * (e.g. a future deploy that corrupts the world-clock config). The
   * event is still server-side active (effects apply, multipliers
   * work) but the per-second countdown cannot be derived. The client
   * should hide the countdown UI and optionally show a "clock
   * degraded" warning so the player knows the panel is in a fallback
   * mode. Distinct from `endsAtTick = 0`, which means "just expired".
   */
  clockDegraded?: true;
}

export type GlobalMarketEventResolution =
  | { status: "absent" | "expired" }
  | { status: "active"; event: ActiveGlobalMarketEvent }
  | { status: "invalid" };

/**
 * Trend direction for a market price quote. Closed set — adding a
 * trend is a one-file change in `isMarketTrend` and the union below.
 * Used by both the parser (validates incoming JSON) and the price
 * applier (applies the multiplier). The client never reads this
 * field directly — it sees the mutated `currentPrice`.
 */
export const MARKET_TRENDS = ["up", "down", "stable"] as const;
export type MarketTrend = (typeof MARKET_TRENDS)[number];

export function isMarketTrend(value: unknown): value is MarketTrend {
  return (
    typeof value === "string" &&
    (MARKET_TRENDS as readonly string[]).includes(value)
  );
}

export type MarketPriceQuote = {
  resource: string;
  currentPrice: number;
  basePrice: number;
  trend: MarketTrend;
};

export type ServerMarketPriceQuote = MarketPriceQuote & {
  volume: number;
};

export function parseMarketPriceQuotes(
  value: unknown,
): ServerMarketPriceQuote[] | null {
  if (!Array.isArray(value)) return null;
  const prices: ServerMarketPriceQuote[] = [];
  let skippedRows = 0;
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.resource !== "string") {
      skippedRows++;
      continue;
    }
    // Supabase sometimes returns numeric columns as strings; coerce at the
    // trust boundary. A single malformed row no longer 503s the entire
    // market panel — the bad row is dropped and logged, the rest pass.
    const currentPrice = Number(entry.currentPrice);
    const basePrice = Number(entry.basePrice);
    const volume = Number(entry.volume);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      skippedRows++;
      continue;
    }
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      skippedRows++;
      continue;
    }
    if (!isMarketTrend(entry.trend)) {
      skippedRows++;
      continue;
    }
    if (!Number.isFinite(volume)) {
      skippedRows++;
      continue;
    }
    prices.push({
      resource: entry.resource,
      currentPrice,
      basePrice,
      trend: entry.trend,
      volume,
    });
  }
  if (skippedRows > 0) {
    // Log once per call (not once per row) so a stream of bad rows
    // doesn't spam the console. Operators can correlate with the
    // upstream DB write that produced the bad row.
    console.warn(
      `[globalMarketEventQuote] parseMarketPriceQuotes dropped ${skippedRows} malformed row(s)`,
      { totalRows: value.length, keptRows: prices.length },
    );
  }
  return prices;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIso(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEffect(value: unknown): GlobalMarketEventEffect | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.target !== "string" ||
    value.target.length === 0 ||
    value.type !== "marketPriceMultiplier" ||
    typeof value.value !== "number" ||
    !Number.isFinite(value.value) ||
    // Multipliers are positive numbers. We accept (0, 1] for price
    // discounts and [1, +∞) for price surges. A multiplier of 0
    // would mean "free resource" — that's a separate "giveaway"
    // mechanic, not a market event effect.
    value.value <= 0 ||
    value.value > 1000
  ) {
    return null;
  }
  return {
    id: value.id,
    type: value.type,
    target: value.target,
    value: value.value,
  };
}

export function resolveActiveGlobalMarketEvent(
  value: unknown,
  nowMs: number,
  clock: WorldClock,
): GlobalMarketEventResolution {
  if (value === null || value === undefined) return { status: "absent" };
  if (
    !Number.isFinite(nowMs) ||
    !isRecord(value) ||
    typeof value.templateId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.icon !== "string" ||
    !Array.isArray(value.effects)
  ) {
    return { status: "invalid" };
  }

  // Tighten the ISO-string guard here so TS narrows the type and
  // we don't need `as string` casts below. parseIso handles
  // non-string inputs (returns null) but TS won't follow the
  // type through a function call.
  if (
    typeof value.startedAt !== "string" ||
    typeof value.expiresAt !== "string"
  ) {
    return { status: "invalid" };
  }

  const startedAtMs = parseIso(value.startedAt);
  const expiresAtMs = parseIso(value.expiresAt);
  if (
    startedAtMs === null ||
    expiresAtMs === null ||
    expiresAtMs <= startedAtMs
  ) {
    return { status: "invalid" };
  }

  const effects = value.effects.map(parseEffect);
  if (effects.some((effect) => effect === null)) return { status: "invalid" };
  if (expiresAtMs <= nowMs) return { status: "expired" };

  // Derive endsAtTick from the canonical world clock so the
  // client can show per-second countdowns without depending on
  // the player's local clock. 0 is the safe fallback (treated
  // as "expired" by callers). When the derivation fails we set
  // `clockDegraded: true` so the client can render a degraded-
  // state UI instead of just hiding the event.
  let endsAtTick: number;
  let clockDegraded: true | undefined;
  try {
    endsAtTick = utcMsToTick(expiresAtMs, clock);
  } catch (err) {
    // Log the failure: a future deploy that corrupts the world
    // clock config would otherwise silently make every active
    // event appear as "expired" to the client.
    console.error(
      "[globalMarketEventQuote] utcMsToTick failed; treating event as expired",
      { expiresAtMs, error: err instanceof Error ? err.message : String(err) },
    );
    endsAtTick = 0;
    clockDegraded = true;
  }

  return {
    status: "active",
    event: {
      templateId: value.templateId,
      name: value.name,
      description: value.description,
      icon: value.icon,
      effects: effects as GlobalMarketEventEffect[],
      startedAt: value.startedAt,
      expiresAt: value.expiresAt,
      endsAtTick,
      ...(clockDegraded ? { clockDegraded: true as const } : {}),
    },
  };
}

export function globalMarketPriceMultipliers(
  activeEvent: ActiveGlobalMarketEvent | null,
): Record<string, number> {
  if (!activeEvent) return {};

  const multipliers: Record<string, number> = {};
  for (const effect of activeEvent.effects) {
    multipliers[effect.target] =
      (multipliers[effect.target] ?? 1) * effect.value;
  }
  return multipliers;
}

export function applyActiveGlobalMarketEventToPrices<
  T extends MarketPriceQuote,
>(prices: T[], value: unknown, nowMs: number, clock: WorldClock): T[] {
  const resolved = resolveActiveGlobalMarketEvent(value, nowMs, clock);
  if (resolved.status !== "active") return prices;

  const multipliers = globalMarketPriceMultipliers(resolved.event);
  return prices.map((price) => {
    const multiplier = multipliers[price.resource];
    if (multiplier === undefined) return price;
    const currentPrice = price.currentPrice * multiplier;
    return Number.isFinite(currentPrice) && currentPrice > 0
      ? { ...price, currentPrice }
      : price;
  });
}

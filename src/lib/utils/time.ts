import { formatNumber as fmtNumber } from "@/lib/game/state/store";

/**
 * Canonical tick rate.
 * Per game design: 1 tick = 1 second.
 */
export const TICKS_PER_SECOND = 1;
export const TICKS_PER_MINUTE = 60;
export const TICKS_PER_HOUR = 3_600;
export const TICKS_PER_DAY = 86_400;

export type TickFormat = "human" | "ticks";

/** "1h 32m 5s" or "5s" or "10m" — for player-facing displays. */
export function formatDuration(
  ticks: number,
  opts?: { compact?: boolean },
): string {
  const t = Math.max(0, Math.floor(ticks));
  if (t <= 0) return "0s";

  const days = Math.floor(t / TICKS_PER_DAY);
  const hours = Math.floor((t % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minutes = Math.floor((t % TICKS_PER_HOUR) / TICKS_PER_MINUTE);
  const seconds = t % TICKS_PER_MINUTE;

  const compact = opts?.compact ?? true;

  if (compact) {
    if (days > 0) return `${days}d ${hours > 0 ? `${hours}h` : ""}`.trim();
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    if (minutes > 0) {
      return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }
    return `${seconds}s`;
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

/** "Now" / "Expired" / "5s" — for short remaining-durations like event timers. */
export function formatRemaining(ticks: number): string {
  const t = Math.floor(ticks);
  if (t <= 0) return "Now";
  return formatDuration(t);
}

/** "12,345" — raw tick count with thousands separators. Used when displaying ticks literally. */
export function formatTicks(ticks: number): string {
  return fmtNumber(Math.max(0, Math.floor(ticks)));
}

/** "12,345 · 3h 25m" — combined view for power users. */
export function formatTickCountWithDuration(ticks: number): string {
  return `${formatTicks(ticks)} · ${formatDuration(ticks)}`;
}

/** Format by mode preference. 'human' = duration, 'ticks' = raw tick count. */
export function formatByMode(ticks: number, mode: TickFormat): string {
  return mode === "human" ? formatDuration(ticks) : formatTicks(ticks);
}

/** Minutes-only approximation for naive conversions like "10 ticks (1 min at 1x)". */
export function ticksToMinutes(ticks: number): number {
  return Math.round(ticks / TICKS_PER_MINUTE);
}

/** "5m ago" / "2h ago" — relative to a past timestamp. */
export function formatRelativeTime(
  epochMs: number,
  nowMs: number = Date.now(),
): string {
  const diffMs = nowMs - epochMs;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** "14:32" — 24-hour clock for header display. Locale-independent. */
export function formatClock(date: Date = new Date()): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Canonical world-clock descriptor. Replaces the legacy
 * `worldClock` object with a minimal shape that callers can
 * pass around. The identity is intentionally stable so that
 * server-side countdowns are reproducible.
 */
export interface WorldClockDescriptor {
  /** Server-anchored start UTC ms (server game epoch). */
  readonly epochMs: number;
  /** Tick rate — how many ticks per real second at speed 1. */
  readonly ticksPerSecond: number;
  /** Display timezone offset, hours east of UTC. */
  readonly displayTimezoneOffsetHours: number;
}

export const DEFAULT_WORLD_CLOCK: WorldClockDescriptor = {
  epochMs: Date.parse("2026-01-01T00:00:00.000Z"),
  ticksPerSecond: 1,
  displayTimezoneOffsetHours: 8,
};

/**
 * Phase 9 (world-clock refactor): render an in-game tick as a
 * wall-clock time using the canonical world clock.
 *
 * Replaces `formatClock(new Date())` in client game UI so the
 * player never sees a local-clock-skewed timer. The clock anchor
 * is the server's `now_iso()` so two players on different devices
 * see the same time at the same instant.
 *
 * @param displayTick current server-authoritative game tick
 * @param worldClock   canonical clock descriptor (defaults to
 *                     DEFAULT_WORLD_CLOCK so callers don't have
 *                     to thread the whole object)
 */
export function formatWorldClock(
  displayTick: number,
  worldClock: WorldClockDescriptor = DEFAULT_WORLD_CLOCK,
): string {
  const secondsSinceEpoch =
    worldClock.epochMs / 1000 + displayTick / worldClock.ticksPerSecond;
  const wallMsUtc = secondsSinceEpoch * 1000;
  // Shift to the display timezone (e.g. GMT+8).
  const offsetMs = worldClock.displayTimezoneOffsetHours * 3_600_000;
  const local = new Date(wallMsUtc + offsetMs);
  const h = local.getUTCHours().toString().padStart(2, "0");
  const m = local.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** "Jun 30" — short month + day for header display. */
export function formatShortDate(date: Date = new Date()): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/** "14:32 · Jun 30" — combined compact pill. */
export function formatClockWithDate(date: Date = new Date()): string {
  return `${formatClock(date)} · ${formatShortDate(date)}`;
}

/**
 * "5m" / "Now" — countdown formatter for event timers.
 *
 * Returns "Now" for non-positive or non-finite inputs so the
 * countdown reaches its end without throwing. Compact format
 * matches what the per-second EventPanel/DashboardPanel display.
 */
export function formatCountdown(remainingTicks: number): string {
  if (!Number.isFinite(remainingTicks) || remainingTicks <= 0) return "Now";
  const t = Math.floor(remainingTicks);
  if (t < 60) return `${t}s`;
  if (t < 3600) {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "2 hours, 5 minutes, 30 seconds" — verbose mode for offline dialog. */
export function formatDurationLong(ticks: number): string {
  const t = Math.max(0, Math.floor(ticks));
  if (t <= 0) return "0 seconds";
  const days = Math.floor(t / TICKS_PER_DAY);
  const hours = Math.floor((t % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minutes = Math.floor((t % TICKS_PER_HOUR) / TICKS_PER_MINUTE);
  const seconds = t % TICKS_PER_MINUTE;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0)
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (seconds > 0)
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  return parts.join(", ");
}

type ClockShape = Pick<WorldClockDescriptor, "epochMs"> & {
  ticksPerSecond?: number;
};

/**
 * Internal validator: throws when the clock shape is malformed so the
 * resolver path can fall through to `clockDegraded=true`. This
 * intentionally rejects the legacy `worldStartUtc` string shape that
 * tests use to simulate a broken clock. The legacy shape set
 * `worldStartUtc` to an ISO string and left `epochMs` undefined;
 * modern callers must populate `epochMs` as a finite number.
 */
function assertValidClock(clock: ClockShape): void {
  // Catch the legacy shape: callers passing only `worldStartUtc`
  // (a string) will have `epochMs === undefined` here.
  if (
    typeof clock !== "object" ||
    clock === null ||
    !Number.isFinite(clock.epochMs)
  ) {
    throw new Error(
      `utcMsToTick failed: clock.epochMs must be a finite number (got ${String(
        (clock as { epochMs?: unknown })?.epochMs,
      )})`,
    );
  }
  const rate = (clock as WorldClockDescriptor).ticksPerSecond;
  if (rate !== undefined && (typeof rate !== "number" || rate <= 0)) {
    throw new Error(
      `utcMsToTick failed: clock.ticksPerSecond must be a positive number (got ${String(rate)})`,
    );
  }
}

/**
 * Phase 8 stub: convert an absolute UTC epoch (ms) into a world-clock
 * game tick. The tick is measured relative to the canonical world
 * clock's `epochMs` anchor at the rate of `ticksPerSecond`.
 *
 * Throws if the clock shape is malformed (NaN epochMs, non-positive
 * ticksPerSecond, or — for back-compat — a legacy `worldStartUtc`
 * string that the descriptor doesn't expose). The market-event
 * resolver catches and falls through to `clockDegraded=true`.
 */
export function utcMsToTick(epochMs: number, clock: ClockShape): number {
  assertValidClock(clock);
  const rate = (clock as WorldClockDescriptor).ticksPerSecond ?? 1;
  return Math.max(0, Math.floor(((epochMs - clock.epochMs) * rate) / 1000));
}

/**
 * Inverse of utcMsToTick — convert a game tick back to the absolute
 * UTC epoch (ms). Used by the market-event resolution path to
 * reconstruct expiresAt for downstream consumers that still expect
 * an ISO timestamp.
 */
export function tickToUtcMs(tick: number, clock: ClockShape): number {
  const rate = (clock as WorldClockDescriptor).ticksPerSecond ?? 1;
  return Math.floor(clock.epochMs + (tick * 1000) / rate);
}

/**
 * Phase 8 stub: world clock descriptor used to anchor server-side countdowns.
 * Real implementation comes from app config; this minimal shape is enough for
 * callers that only need a stable identity to pass around.
 */
export interface WorldClock {
  /** Identifier (epoch seconds since server start, deployment id, etc.). */
  readonly id: string;
  /** Reference epoch in ms — start of game time. */
  readonly epochMs: number;
}

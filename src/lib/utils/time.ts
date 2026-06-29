import { formatNumber as fmtNumber } from '@/lib/game/store';

/**
 * Canonical tick rate.
 * Per game design: 1 tick = 1 second.
 */
export const TICKS_PER_SECOND = 1;
export const TICKS_PER_MINUTE = 60;
export const TICKS_PER_HOUR = 3_600;
export const TICKS_PER_DAY = 86_400;

export type TickFormat = 'human' | 'ticks';

/** "1h 32m 5s" or "5s" or "10m" — for player-facing displays. */
export function formatDuration(ticks: number, opts?: { compact?: boolean }): string {
  const t = Math.max(0, Math.floor(ticks));
  if (t <= 0) return '0s';

  const days = Math.floor(t / TICKS_PER_DAY);
  const hours = Math.floor((t % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minutes = Math.floor((t % TICKS_PER_HOUR) / TICKS_PER_MINUTE);
  const seconds = t % TICKS_PER_MINUTE;

  const compact = opts?.compact ?? true;

  if (compact) {
    if (days > 0) return `${days}d ${hours > 0 ? `${hours}h` : ''}`.trim();
    if (hours > 0) {
      return minutes > 0
        ? `${hours}h ${minutes}m`
        : `${hours}h`;
    }
    if (minutes > 0) {
      return seconds > 0
        ? `${minutes}m ${seconds}s`
        : `${minutes}m`;
    }
    return `${seconds}s`;
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/** "Now" / "Expired" / "5s" — for short remaining-durations like event timers. */
export function formatRemaining(ticks: number): string {
  const t = Math.floor(ticks);
  if (t <= 0) return 'Now';
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
  return mode === 'human' ? formatDuration(ticks) : formatTicks(ticks);
}

/** Minutes-only approximation for naive conversions like "10 ticks (1 min at 1x)". */
export function ticksToMinutes(ticks: number): number {
  return Math.round(ticks / TICKS_PER_MINUTE);
}

/** "5m ago" / "2h ago" — relative to a past timestamp. */
export function formatRelativeTime(epochMs: number, nowMs: number = Date.now()): string {
  const diffMs = nowMs - epochMs;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) return 'just now';
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
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** "Jun 30" — short month + day for header display. */
export function formatShortDate(date: Date = new Date()): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/** "14:32 · Jun 30" — combined compact pill. */
export function formatClockWithDate(date: Date = new Date()): string {
  return `${formatClock(date)} · ${formatShortDate(date)}`;
}

/** "2 hours, 5 minutes, 30 seconds" — verbose mode for offline dialog. */
export function formatDurationLong(ticks: number): string {
  const t = Math.max(0, Math.floor(ticks));
  if (t <= 0) return '0 seconds';
  const days = Math.floor(t / TICKS_PER_DAY);
  const hours = Math.floor((t % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minutes = Math.floor((t % TICKS_PER_HOUR) / TICKS_PER_MINUTE);
  const seconds = t % TICKS_PER_MINUTE;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (seconds > 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  return parts.join(', ');
}

/**
 * formatNumber.ts — Utility function for formatting large numbers.
 *
 * Extracted from store.ts to break the monolithic file into feature-based
 * modules per the STORE_DECOMPOSITION_ARCHITECTURE.md plan.
 *
 * Formats numbers with K/M/B/T suffixes for compact display.
 * Handles Infinity, NaN, integers, and small decimals.
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const abs = Math.abs(n);
  const prefix = n < 0 ? '-' : '';
  if (abs >= 1e12) return prefix + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return prefix + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return prefix + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return prefix + (abs / 1e3).toFixed(2) + 'K';
  if (Number.isInteger(n) && n >= 1) return n.toString();
  if (n >= 100) return Math.floor(n).toString();
  if (n >= 1) return n.toFixed(1);
  if (n > 0) return n.toFixed(2);
  if (n < 0) return prefix + formatNumber(abs);
  return '0';
}

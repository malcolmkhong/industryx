// ============================================
// INDUSTRIAX: Resource Display Helpers
// ============================================
//
// Centralized lookups for the human-readable fields stored in
// RESOURCE_META. These are the UI-side equivalent of the data
// side: they read from the live runtime cache and return safe
// fallbacks for unknown / unloaded resources.
//
// Why a dedicated module?
//   - Single import surface for every place that needs a resource
//     display string (game store, news, market, events, UI).
//   - Consistent fallback behavior across the codebase.
//   - Keeps `formatNumber` / shared utils free of config coupling.
//
// All helpers are pure functions that read from the runtime cache
// only; they do not mutate state and are safe to call from any
// layer (client, server, middleware).
// ============================================

import { RESOURCE_META } from "../runtimeCache";
import { formatNumber } from "../../shared/utils/formatNumber";

export interface ResourceDisplayMeta {
  name: string;
  icon: string;
  color: string;
  tier: number;
  baseCapacity: number;
}

/**
 * Resolve a resource id to its full display meta. Returns `undefined`
 * if the id is not in the live RESOURCE_META map (e.g. config not
 * loaded yet, or a stale id from an old save).
 */
export function getResourceMeta(resource: string): ResourceDisplayMeta | undefined {
  const meta = RESOURCE_META[resource as keyof typeof RESOURCE_META];
  if (!meta) return undefined;
  return {
    name: meta.name,
    icon: meta.icon,
    color: meta.color,
    tier: meta.tier,
    baseCapacity: meta.baseCapacity,
  };
}

/** Human-readable name. Falls back to prettified id. */
export function getResourceName(resource: string): string {
  const meta = getResourceMeta(resource);
  if (meta) return meta.name;
  return prettifyResourceName(resource);
}

/** Iconify icon string (e.g. "game-icons:iron-ore"). Falls back to a generic cube. */
export function getResourceIcon(resource: string): string {
  return getResourceMeta(resource)?.icon ?? "game-icons:cube";
}

/** HSL/CSS color string for the resource. Falls back to neutral gray. */
export function getResourceColor(resource: string): string {
  return getResourceMeta(resource)?.color ?? "#a0a0a0";
}

/** Default base storage capacity. Falls back to 100 (matches game default). */
export function getResourceBaseCapacity(resource: string): number {
  return getResourceMeta(resource)?.baseCapacity ?? 100;
}

/**
 * Format a numeric amount for display with the resource's name appended.
 * Falls back to the raw `formatNumber` output if the resource is unknown.
 */
export function formatResourceAmount(amount: number, resource: string): string {
  return `${formatNumber(amount)} ${getResourceName(resource)}`;
}

/**
 * Format a storage capacity as "X / Y" using the resource's base
 * capacity as the denominator. Useful for inventory HUDs.
 */
export function formatStorageCapacity(
  current: number,
  resource: string,
): string {
  const cap = getResourceBaseCapacity(resource);
  return `${formatNumber(current)} / ${formatNumber(cap)}`;
}

/**
 * camelCase / snake_case → "Title Case". Mirrors the fallback in
 * `prettifyChainName` so display helpers agree on naming.
 */
export function prettifyResourceName(resource: string): string {
  return resource
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

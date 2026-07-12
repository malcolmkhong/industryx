/**
 * Engine Barrel — Industry-Standard Single Import Point
 *
 * Re-exports the entire market engine from one location.
 *
 * Usage:
 *   import { simulateMarketTick, getSectorInfo, RESOURCE_SECTOR } from '@/lib/game/market/engine';
 *
 * The legacy `marketSimulator.ts` is now a thin re-export of this barrel
 * for back-compat with existing imports.
 */

export * from './types';
export * from './sectors';
export * from './correlations';

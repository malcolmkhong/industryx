/**
 * Engine Barrel — Industry-Standard Single Import Point
 *
 * Re-exports active market engine types, sector helpers, and correlation data
 * from one location.
 *
 * Usage:
 *   import { getSectorInfo, RESOURCE_SECTOR, PRICE_CORRELATIONS } from '@/lib/game/market/engine';
 *
 * The legacy `marketSimulator.ts` is now a thin re-export of this barrel
 * for back-compat with existing imports.
 */

export * from './types';
export * from './sectors';
export * from './correlations';

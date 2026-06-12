// ============================================
// Named Selectors: Barrel Export
// ============================================
//
// Single import surface for all named selectors. Usage:
//
//   import { selectMoney, selectPowerPercent } from '@/lib/game/selectors';
//   const money = useGameStore(selectMoney);
//   const powerPct = useGameStore(selectPowerPercent);
//
// Each selector is a pure function (s: GameState) => derivedValue.
// Curried selectors (selectBuildingsByType(type)) return a function
// that you pass to useGameStore directly.
// ============================================

export * from './economy';
export * from './buildings';
export * from './power';
export * from './research';
export * from './workers';

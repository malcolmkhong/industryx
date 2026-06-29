/**
 * TESTS: utils/gameMath
 *
 * Tests pure math helpers: getGlobalPrice, getMegaProjectBonus.
 * Target: utils/gameMath.ts
 */

import { describe, it, expect } from 'vitest';
import { getGlobalPrice, getMegaProjectBonus } from '@/lib/game/utils/gameMath';
import type { GameState, MegaProjectBonusType } from '@/lib/game/types';

// ─── Tests: getGlobalPrice ───────────────────────────────────────────

describe('utils/gameMath :: getGlobalPrice', () => {
  it('returns server market price when available', () => {
    const state = {
      serverMarket: { prices: [{ resource: 'iron', currentPrice: 25 }] },
      market: [{ resource: 'iron', currentPrice: 10 }],
    } as unknown as GameState;

    expect(getGlobalPrice(state, 'iron' as never)).toBe(25);
  });

  it('falls back to local market price when no server price', () => {
    const state = {
      serverMarket: { prices: [] },
      market: [{ resource: 'iron', currentPrice: 10 }],
    } as unknown as GameState;

    expect(getGlobalPrice(state, 'iron' as never)).toBe(10);
  });

  it('returns 0 when resource not found in either market', () => {
    const state = {
      serverMarket: { prices: [] },
      market: [],
    } as unknown as GameState;

    expect(getGlobalPrice(state, 'iron' as never)).toBe(0);
  });

  it('returns 0 when serverMarket is null', () => {
    const state = {
      serverMarket: null,
      market: [],
    } as unknown as GameState;

    expect(getGlobalPrice(state, 'iron' as never)).toBe(0);
  });
});

// ─── Tests: getMegaProjectBonus ──────────────────────────────────────

describe('utils/gameMath :: getMegaProjectBonus', () => {
  it('returns 0 when no completed projects', () => {
    const projects: { completed: boolean; bonus: { type: MegaProjectBonusType; value: number } }[] = [
      { completed: false, bonus: { type: 'buildingCostReduction', value: 0.2 } },
    ];
    expect(getMegaProjectBonus(projects, 'buildingCostReduction')).toBe(0);
  });

  it('sums values from completed projects of matching type', () => {
    const projects: { completed: boolean; bonus: { type: MegaProjectBonusType; value: number } }[] = [
      { completed: true, bonus: { type: 'buildingCostReduction', value: 0.2 } },
      { completed: true, bonus: { type: 'buildingCostReduction', value: 0.15 } },
    ];
    expect(getMegaProjectBonus(projects, 'buildingCostReduction')).toBe(0.35);
  });

  it('ignores non-matching bonus types', () => {
    const projects: { completed: boolean; bonus: { type: MegaProjectBonusType; value: number } }[] = [
      { completed: true, bonus: { type: 'buildingCostReduction', value: 0.2 } },
      { completed: true, bonus: { type: 'unlimitedStorage', value: 1 } },
    ];
    expect(getMegaProjectBonus(projects, 'buildingCostReduction')).toBe(0.2);
  });

  it('ignores incomplete projects', () => {
    const projects: { completed: boolean; bonus: { type: MegaProjectBonusType; value: number } }[] = [
      { completed: false, bonus: { type: 'buildingCostReduction', value: 0.2 } },
      { completed: true, bonus: { type: 'buildingCostReduction', value: 0.1 } },
    ];
    expect(getMegaProjectBonus(projects, 'buildingCostReduction')).toBe(0.1);
  });

  it('returns 0 for empty array', () => {
    expect(getMegaProjectBonus([], 'buildingCostReduction')).toBe(0);
  });
});

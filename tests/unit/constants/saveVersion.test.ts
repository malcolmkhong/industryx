/**
 * TESTS: constants/saveVersion
 *
 * Tests that SAVE_VERSION is the correct current value.
 * Target: constants/saveVersion.ts
 */

import { describe, it, expect } from 'vitest';
import { SAVE_VERSION } from '@/lib/game/shared/constants/saveVersion';

describe('constants/saveVersion', () => {
  it('has the correct current save version', () => {
    expect(SAVE_VERSION).toBe(20);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(SAVE_VERSION)).toBe(true);
    expect(SAVE_VERSION).toBeGreaterThan(0);
  });

  it('is a number', () => {
    expect(typeof SAVE_VERSION).toBe('number');
  });
});

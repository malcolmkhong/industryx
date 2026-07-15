// ModifierEngine: resolves a target against a base value by walking the
// modifier pipeline (add → multiply → max → min → override). Additive
// stacking for multiply operations matches the current game behavior.

import type {
  ModifierSource,
  ModifierTarget,
} from "./types";
import type { ModifierRegistry } from "./registry";

/**
 * The engine resolves modifiers against a base value.
 * This is the single place where all modifier math happens.
 *
 * Resolution order:
 * 1. Start with base value
 * 2. Apply 'add' modifiers (flat bonuses)
 * 3. Apply 'multiply' modifiers (percentage bonuses)
 * 4. Apply 'max' modifiers
 * 5. Apply 'min' modifiers
 * 6. Apply 'override' modifiers (last, takes precedence)
 *
 * Multiply operations are applied multiplicatively (stacking):
 *   base * (1 + sum_of_bonus_values)  ← additive stacking (standard for idle games)
 * OR
 *   base * prod(1 + each_bonus_value) ← multiplicative stacking
 *
 * We use ADDITIVE stacking for same-target multipliers by default
 * (this matches the current game behavior where research bonuses are summed).
 */
export class ModifierEngine {
  private registry: ModifierRegistry;

  constructor(registry: ModifierRegistry) {
    this.registry = registry;
  }

  /**
   * Resolve a target to its final value given a base value.
   *
   * @param target - What we're calculating
   * @param baseValue - The starting value before modifiers
   * @param options - Optional subTarget filter and stacking mode
   * @returns The final resolved value
   */
  resolve(
    target: ModifierTarget,
    baseValue: number,
    options?: {
      subTarget?: string;
      /** 'additive' = sum bonuses then multiply (default, matches current game) */
      /** 'multiplicative' = multiply each bonus independently */
      stacking?: 'additive' | 'multiplicative';
      /** Skip certain sources (for debugging/dry-run) */
      excludeSources?: ModifierSource[];
    }
  ): number {
    const mods = options?.subTarget
      ? this.registry.getModifiersWithSubTarget(target, options.subTarget)
      : this.registry.getModifiers(target);

    const excludeSources = options?.excludeSources;
    const filteredMods = excludeSources
      ? mods.filter(m => !excludeSources.includes(m.source))
      : mods;

    let result = baseValue;

    // Phase 1: Add modifiers (flat bonuses)
    const addMods = filteredMods.filter(m => m.operation === 'add');
    for (const m of addMods) {
      result += m.value;
    }

    // Phase 2: Multiply modifiers
    const multiplyMods = filteredMods.filter(m => m.operation === 'multiply');
    if (multiplyMods.length > 0) {
      if (options?.stacking === 'multiplicative') {
        // Each multiplier applied independently
        for (const m of multiplyMods) {
          result *= m.value;
        }
      } else {
        // Additive stacking: sum all bonus values, then multiply once
        // This matches current behavior: (1 + 0.15 + 0.20) = 1.35
        const totalMultiplier = multiplyMods.reduce((sum, m) => sum + (m.value - 1), 0);
        result *= (1 + totalMultiplier);
      }
    }

    // Phase 3: Max modifiers
    const maxMods = filteredMods.filter(m => m.operation === 'max');
    for (const m of maxMods) {
      result = Math.max(result, m.value);
    }

    // Phase 4: Min modifiers
    const minMods = filteredMods.filter(m => m.operation === 'min');
    for (const m of minMods) {
      result = Math.min(result, m.value);
    }

    // Phase 5: Override modifiers (last)
    const overrideMods = filteredMods.filter(m => m.operation === 'override');
    if (overrideMods.length > 0) {
      // Last override wins (sorted by priority if set)
      const sorted = overrideMods.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      result = sorted[sorted.length - 1].value;
    }

    return result;
  }

  /**
   * Resolve the sum of all 'add' modifier values for a target.
   * Useful for computing "total bonus from X" for display.
   */
  resolveAddSum(target: ModifierTarget, subTarget?: string): number {
    const mods = subTarget
      ? this.registry.getModifiersWithSubTarget(target, subTarget)
      : this.registry.getModifiers(target);
    return mods
      .filter(m => m.operation === 'add' && m.active !== false)
      .reduce((sum, m) => sum + m.value, 0);
  }

  /**
   * Resolve the total multiplier bonus for a target.
   * Returns the combined multiplier (1.0 = no change).
   */
  resolveMultiplier(target: ModifierTarget, subTarget?: string): number {
    const mods = subTarget
      ? this.registry.getModifiersWithSubTarget(target, subTarget)
      : this.registry.getModifiers(target);
    const multiplyMods = mods.filter(m => m.operation === 'multiply' && m.active !== false);
    if (multiplyMods.length === 0) return 1;
    // Additive stacking
    return 1 + multiplyMods.reduce((sum, m) => sum + (m.value - 1), 0);
  }

  /**
   * Check if any modifier for a target exists (useful for boolean flags like hasMarketAnalysis)
   */
  hasModifier(target: ModifierTarget, source?: ModifierSource): boolean {
    const mods = this.registry.getModifiers(target);
    if (source) return mods.some(m => m.source === source);
    return mods.length > 0;
  }

  /**
   * Get the registry (for debugging/inspection)
   */
  getRegistry(): ModifierRegistry {
    return this.registry;
  }
}

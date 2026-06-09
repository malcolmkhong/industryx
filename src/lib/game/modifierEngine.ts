// ============================================
// INDUSTRIAX: Modifier Engine
// Data-driven modifier architecture for scalable
// game economy calculations
// ============================================
//
// ARCHITECTURE:
//   Any system (Research, Weather, Events, Prestige,
//   MegaProjects, Achievements, Policies, etc.) produces
//   Modifier[] → ModifierRegistry → ModifierEngine → resolved values
//
// DESIGN PRINCIPLES:
//   1. Every bonus/malus is a Modifier — no hardcoded if-checks
//   2. Modifiers are resolved by target, not by source
//   3. Same engine works client-side AND server-side
//   4. Backward compatible — existing behavior unchanged
//   5. Type-safe — TypeScript enforces correct usage
//   6. Extensible — new systems add new ModifierSources, no formula rewrites

// ─── Modifier Target ──────────────────────────────────────────────────

/**
 * Every producible/computable thing in the game that can be modified.
 * This is the UNION of all possible things modifiers can affect.
 * New systems add new targets here.
 */
export type ModifierTarget =
  // Production categories
  | 'production.extractor'         // All extractor production
  | 'production.factory'           // All factory production
  | 'production.factory.t1'        // T1 factory production
  | 'production.factory.t2'        // T2 factory production
  | 'production.factory.t3'        // T3 factory production
  | 'production.global'            // Global production multiplier
  | 'production.payout'            // Payout cycle amount

  // Building-specific production
  | `production.building.${string}` // e.g. 'production.building.aiLab'

  // Power grid
  | 'power.production'             // Power generation
  | 'power.consumption'            // Power consumption (reductions = negative modifier)
  | 'power.efficiency'             // Direct efficiency modifier

  // Transport
  | 'transport.throughput'         // Transport line throughput
  | 'transport.productionBonus'    // Production bonus from transport efficiency

  // Market
  | 'market.sellPrice'             // Sell price multiplier
  | 'market.buyPrice'              // Buy price multiplier

  // Research
  | 'research.speed'               // Research speed multiplier

  // Workers
  | 'worker.efficiency'            // Worker efficiency bonus
  | 'worker.speed'                 // Worker speed bonus
  | 'worker.maintenance'           // Worker maintenance (power saving)

  // Storage
  | 'storage.capacity'             // Storage capacity multiplier

  // Currencies
  | 'currency.money'               // Money income
  | 'currency.researchPoints'      // RP income
  | 'currency.corporationPoints'   // CP income

  // Offline
  | 'offline.rate'                 // Offline progression rate

  // Building cost
  | 'building.cost'                // Building cost modifier (1 = no change, <1 = cheaper)

  // Endgame passive income
  | 'endgame.money'                // Endgame money per tick
  | 'endgame.researchPoints'       // Endgame RP per tick
  | 'endgame.corporationPoints'    // Endgame CP per tick

  // Weather (these are special — they provide the base weather multipliers)
  | 'weather.production'           // Weather production effect
  | 'weather.solar'                // Weather solar effect
  | 'weather.wind'                 // Weather wind effect

  // Events
  | 'event.production.global'      // Global event production modifier
  | 'event.production.targeted'    // Targeted event production modifier (uses subTarget)
  | 'event.power'                  // Event power modifier
  | 'event.research'               // Event research modifier

  // Sell multiplier base
  | 'sell.baseMultiplier';         // Base sell multiplier (default 0.9)

// ─── Modifier Source ──────────────────────────────────────────────────

/**
 * Identifies which game system produced this modifier.
 * Used for debugging, UI display, and conditional logic.
 */
export type ModifierSource =
  | 'research'
  | 'prestige'
  | 'megaProject'
  | 'event'
  | 'weather'
  | 'worker'
  | 'achievement'
  | 'policy'
  | 'seasonal'
  | 'buff'
  | 'market'
  | 'config'          // From game_config_balancing_rules
  | 'custom';         // For testing or one-off modifiers

// ─── Modifier Operation ───────────────────────────────────────────────

/**
 * How the modifier value is applied:
 * - 'multiply': value is a multiplier (1.0 = no change, 1.15 = +15%)
 * - 'add': value is added to the base (e.g., +5 flat)
 * - 'override': value replaces the base entirely (rare, used for config)
 * - 'max': takes the maximum of current value and modifier value
 * - 'min': takes the minimum of current value and modifier value
 */
export type ModifierOperation = 'multiply' | 'add' | 'override' | 'max' | 'min';

// ─── Modifier ─────────────────────────────────────────────────────────

/**
 * A single modifier entry. This is the atomic unit of the modifier system.
 *
 * Example: Research "Basic Automation" produces:
 *   { id: 'research:basicAutomation', source: 'research', target: 'production.extractor',
 *     operation: 'multiply', value: 1.15, sourceId: 'basicAutomation' }
 *
 * Example: Weather "rainy" produces:
 *   { id: 'weather:rainy:production', source: 'weather', target: 'weather.production',
 *     operation: 'override', value: 0.9, sourceId: 'rainy' }
 */
export interface Modifier {
  /** Unique identifier for this modifier instance */
  id: string;
  /** Which system produced this modifier */
  source: ModifierSource;
  /** What this modifier affects */
  target: ModifierTarget;
  /** How this modifier is applied */
  operation: ModifierOperation;
  /** The modifier value (interpretation depends on operation) */
  value: number;
  /** Optional: specific sub-target (e.g., building type for targeted events) */
  subTarget?: string;
  /** Optional: source entity ID (e.g., research ID, event ID) */
  sourceId?: string;
  /** Optional: priority for resolution order (higher = applied later) */
  priority?: number;
  /** Optional: human-readable description for UI */
  description?: string;
  /** Optional: whether this modifier is currently active (can be toggled) */
  active?: boolean;
}

// ─── Modifier Registry ────────────────────────────────────────────────

/**
 * The registry holds all active modifiers and provides efficient lookup.
 * It is rebuilt every tick from the current game state.
 */
export class ModifierRegistry {
  private modifiers: Modifier[] = [];
  private byTarget: Map<ModifierTarget, Modifier[]> = new Map();

  /** Register a modifier (or array of modifiers) into the registry */
  register(modifier: Modifier | Modifier[]): void {
    const mods = Array.isArray(modifier) ? modifier : [modifier];
    for (const m of mods) {
      if (m.active === false) continue; // Skip inactive modifiers
      this.modifiers.push(m);
      const list = this.byTarget.get(m.target);
      if (list) {
        list.push(m);
      } else {
        this.byTarget.set(m.target, [m]);
      }
    }
  }

  /** Get all modifiers for a given target */
  getModifiers(target: ModifierTarget): Modifier[] {
    return this.byTarget.get(target) ?? [];
  }

  /** Get all modifiers for a target, filtered by subTarget */
  getModifiersWithSubTarget(target: ModifierTarget, subTarget: string): Modifier[] {
    return (this.byTarget.get(target) ?? []).filter(m => m.subTarget === subTarget);
  }

  /** Get all modifiers from a specific source */
  getBySource(source: ModifierSource): Modifier[] {
    return this.modifiers.filter(m => m.source === source);
  }

  /** Get all modifiers */
  getAll(): Modifier[] {
    return [...this.modifiers];
  }

  /** Clear the registry */
  clear(): void {
    this.modifiers = [];
    this.byTarget.clear();
  }

  /** Get count of registered modifiers */
  get size(): number {
    return this.modifiers.length;
  }
}

// ─── Modifier Engine ──────────────────────────────────────────────────

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

    const filteredMods = options?.excludeSources
      ? mods.filter(m => !options.excludeSources!.includes(m.source))
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

// ─── Modifier Builders ────────────────────────────────────────────────

/**
 * Helper functions to create modifiers from game systems.
 * Each game system should have its own builder that produces Modifier[].
 */

/** Create a research modifier from a ResearchEffect */
export function researchToModifiers(
  researchId: string,
  effects: Array<{
    type: string;
    target?: string;
    value: number;
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const effect of effects) {
    const baseId = `research:${researchId}:${effect.type}`;

    switch (effect.type) {
      case 'productionSpeed':
        if (effect.target === 'extractor') {
          modifiers.push({
            id: `${baseId}:extractor`,
            source: 'research',
            target: 'production.extractor',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% extractor speed`,
          });
        } else if (effect.target === 'factory') {
          modifiers.push({
            id: `${baseId}:factory`,
            source: 'research',
            target: 'production.factory',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% factory speed`,
          });
        } else if (effect.target === 't1Factory') {
          modifiers.push({
            id: `${baseId}:t1Factory`,
            source: 'research',
            target: 'production.factory.t1',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% T1 factory speed`,
          });
        } else if (effect.target === 't2Factory') {
          modifiers.push({
            id: `${baseId}:t2Factory`,
            source: 'research',
            target: 'production.factory.t2',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% T2 factory speed`,
          });
        } else if (effect.target === 't3Factory') {
          modifiers.push({
            id: `${baseId}:t3Factory`,
            source: 'research',
            target: 'production.factory.t3',
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            description: `+${Math.round(effect.value * 100)}% T3 factory speed`,
          });
        } else if (effect.target) {
          // Building-specific production speed (e.g., 'aiLab', 'quantumLab')
          modifiers.push({
            id: `${baseId}:${effect.target}`,
            source: 'research',
            target: `production.building.${effect.target}` as ModifierTarget,
            operation: 'multiply',
            value: 1 + effect.value,
            sourceId: researchId,
            subTarget: effect.target,
            description: `+${Math.round(effect.value * 100)}% ${effect.target} speed`,
          });
        }
        break;

      case 'transportSpeed':
        modifiers.push({
          id: `${baseId}:transport`,
          source: 'research',
          target: 'transport.throughput',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% transport speed`,
        });
        break;

      case 'powerEfficiency':
        modifiers.push({
          id: `${baseId}:powerEfficiency`,
          source: 'research',
          target: 'power.consumption',
          operation: 'multiply',
          value: 1 - effect.value, // reduction = multiply by (1 - value)
          sourceId: researchId,
          description: `-${Math.round(effect.value * 100)}% power consumption`,
        });
        break;

      case 'marketBonus':
        modifiers.push({
          id: `${baseId}:marketBonus`,
          source: 'research',
          target: 'market.sellPrice',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% sell price`,
        });
        break;

      case 'workerEfficiency':
        modifiers.push({
          id: `${baseId}:workerEfficiency`,
          source: 'research',
          target: 'worker.efficiency',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% worker efficiency`,
        });
        break;

      case 'storageBonus':
        modifiers.push({
          id: `${baseId}:storageBonus`,
          source: 'research',
          target: 'storage.capacity',
          operation: 'multiply',
          value: 1 + effect.value,
          sourceId: researchId,
          description: `+${Math.round(effect.value * 100)}% storage capacity`,
        });
        break;

      case 'unlockBuilding':
      case 'unlockTransport':
      case 'unlockAutomation':
        // Unlock effects are NOT modifiers — they unlock content
        // These are handled by the existing unlockRequirement system
        break;
    }
  }

  return modifiers;
}

/** Create prestige modifiers from PrestigeBonus[] */
export function prestigeToModifiers(
  bonuses: Array<{
    id: string;
    purchased: boolean;
    effect: { type: string; value: number };
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const b of bonuses) {
    if (!b.purchased) continue;

    const baseId = `prestige:${b.id}`;

    switch (b.effect.type) {
      case 'productionMultiplier':
        modifiers.push({
          id: `${baseId}:production`,
          source: 'prestige',
          target: 'production.payout',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% production from prestige`,
        });
        break;
      case 'powerMultiplier':
        modifiers.push({
          id: `${baseId}:power`,
          source: 'prestige',
          target: 'power.production',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% power from prestige`,
        });
        break;
      case 'researchMultiplier':
        modifiers.push({
          id: `${baseId}:research`,
          source: 'prestige',
          target: 'research.speed',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% research from prestige`,
        });
        break;
      case 'marketMultiplier':
        modifiers.push({
          id: `${baseId}:market`,
          source: 'prestige',
          target: 'market.sellPrice',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% sell price from prestige`,
        });
        break;
      case 'storageMultiplier':
        modifiers.push({
          id: `${baseId}:storage`,
          source: 'prestige',
          target: 'storage.capacity',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% storage from prestige`,
        });
        break;
      case 'offlineMultiplier':
        modifiers.push({
          id: `${baseId}:offline`,
          source: 'prestige',
          target: 'offline.rate',
          operation: 'multiply',
          value: 1 + b.effect.value,
          sourceId: b.id,
          description: `+${Math.round(b.effect.value * 100)}% offline rate from prestige`,
        });
        break;
    }
  }

  return modifiers;
}

/** Create mega project modifiers from completed MegaProject[] */
export function megaProjectToModifiers(
  megaProjects: Array<{
    type: string;
    completed: boolean;
    bonus: { type: string; value: number };
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const p of megaProjects) {
    if (!p.completed) continue;

    const baseId = `megaProject:${p.type}`;

    switch (p.bonus.type) {
      case 'productionMultiplier':
        modifiers.push({
          id: `${baseId}:production`,
          source: 'megaProject',
          target: 'production.payout',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% production from ${p.type}`,
        });
        break;
      case 'extractionMultiplier':
        modifiers.push({
          id: `${baseId}:extraction`,
          source: 'megaProject',
          target: 'production.extractor',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% extraction from ${p.type}`,
        });
        break;
      case 'powerMultiplier':
        modifiers.push({
          id: `${baseId}:power`,
          source: 'megaProject',
          target: 'power.production',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% power from ${p.type}`,
        });
        break;
      case 'researchMultiplier':
        modifiers.push({
          id: `${baseId}:research`,
          source: 'megaProject',
          target: 'research.speed',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% research from ${p.type}`,
        });
        break;
      case 'workerEfficiency':
        modifiers.push({
          id: `${baseId}:worker`,
          source: 'megaProject',
          target: 'worker.efficiency',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% worker efficiency from ${p.type}`,
        });
        break;
      case 'transportMultiplier':
        modifiers.push({
          id: `${baseId}:transport`,
          source: 'megaProject',
          target: 'transport.throughput',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% transport from ${p.type}`,
        });
        break;
      case 'marketMultiplier':
        modifiers.push({
          id: `${baseId}:market`,
          source: 'megaProject',
          target: 'market.sellPrice',
          operation: 'multiply',
          value: 1 + p.bonus.value,
          sourceId: p.type,
          description: `+${Math.round(p.bonus.value * 100)}% sell price from ${p.type}`,
        });
        break;
      case 'buildingCostReduction':
        modifiers.push({
          id: `${baseId}:costReduction`,
          source: 'megaProject',
          target: 'building.cost',
          operation: 'multiply',
          value: 1 - p.bonus.value,
          sourceId: p.type,
          description: `-${Math.round(p.bonus.value * 100)}% building cost from ${p.type}`,
        });
        break;
      // 'unlimitedStorage' is a flag, not a numeric modifier
    }
  }

  return modifiers;
}

/** Create event modifiers from active GameEvent[] */
export function eventsToModifiers(
  events: Array<{
    id: string;
    effects: Array<{ type: string; target?: string; value: number }>;
  }>
): Modifier[] {
  const modifiers: Modifier[] = [];

  for (const event of events) {
    for (const effect of event.effects) {
      const baseId = `event:${event.id}:${effect.type}`;

      switch (effect.type) {
        case 'productionMultiplier':
          if (effect.target) {
            modifiers.push({
              id: `${baseId}:targeted:${effect.target}`,
              source: 'event',
              target: 'event.production.targeted',
              operation: 'multiply',
              value: effect.value,
              sourceId: event.id,
              subTarget: effect.target,
              description: `Event: ${effect.value}x production for ${effect.target}`,
            });
          } else {
            modifiers.push({
              id: `${baseId}:global`,
              source: 'event',
              target: 'event.production.global',
              operation: 'multiply',
              value: effect.value,
              sourceId: event.id,
              description: `Event: ${effect.value}x global production`,
            });
          }
          break;
        case 'powerMultiplier':
          modifiers.push({
            id: `${baseId}:power`,
            source: 'event',
            target: 'event.power',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x power consumption`,
          });
          break;
        case 'researchSpeed':
          modifiers.push({
            id: `${baseId}:research`,
            source: 'event',
            target: 'event.research',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x research speed`,
          });
          break;
        case 'marketPriceMultiplier':
          modifiers.push({
            id: `${baseId}:market`,
            source: 'event',
            target: 'market.sellPrice',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x market prices`,
          });
          break;
        case 'transportSpeed':
          modifiers.push({
            id: `${baseId}:transport`,
            source: 'event',
            target: 'transport.throughput',
            operation: 'multiply',
            value: effect.value,
            sourceId: event.id,
            description: `Event: ${effect.value}x transport speed`,
          });
          break;
      }
    }
  }

  return modifiers;
}

/** Create weather modifiers from current WeatherState */
export function weatherToModifiers(
  weather: {
    current: string;
    intensity: number;
  },
  weatherDefs: Record<string, {
    productionMultiplier: number;
    solarMultiplier: number;
    windMultiplier: number;
  }>
): Modifier[] {
  const def = weatherDefs[weather.current];
  if (!def) return [];

  return [
    {
      id: `weather:${weather.current}:production`,
      source: 'weather',
      target: 'weather.production',
      operation: 'override',
      value: def.productionMultiplier,
      sourceId: weather.current,
      description: `Weather ${weather.current}: ${def.productionMultiplier}x production`,
    },
    {
      id: `weather:${weather.current}:solar`,
      source: 'weather',
      target: 'weather.solar',
      operation: 'override',
      value: def.solarMultiplier,
      sourceId: weather.current,
      description: `Weather ${weather.current}: ${def.solarMultiplier}x solar`,
    },
    {
      id: `weather:${weather.current}:wind`,
      source: 'weather',
      target: 'weather.wind',
      operation: 'override',
      value: def.windMultiplier,
      sourceId: weather.current,
      description: `Weather ${weather.current}: ${def.windMultiplier}x wind`,
    },
  ];
}

// ─── Registry Builder ─────────────────────────────────────────────────

/**
 * Build a fully populated ModifierRegistry from the current game state.
 * This is the main entry point for the modifier system.
 *
 * Call this once per tick, then use ModifierEngine.resolve() for all calculations.
 */
export function buildModifierRegistry(state: {
  completedResearch: string[];
  activeResearch: string | null;
  researchProgress: number;
  prestigeState: {
    bonuses: Array<{
      id: string;
      purchased: boolean;
      effect: { type: string; value: number };
    }>;
    megaFactoryUnlocked: boolean;
  };
  megaProjects: Array<{
    type: string;
    completed: boolean;
    bonus: { type: string; value: number };
  }>;
  activeEvents: Array<{
    id: string;
    effects: Array<{ type: string; target?: string; value: number }>;
  }>;
  weather: {
    current: string;
    intensity: number;
  };
  workers: Array<{
    id: string;
    type: string;
    level: number;
    assignedTo: string | null;
    efficiency: number;
    speed: number;
    maintenance: number;
  }>;
}, researchTree: Array<{
  id: string;
  effects: Array<{ type: string; target?: string; value: number }>;
}>, weatherDefs: Record<string, {
  productionMultiplier: number;
  solarMultiplier: number;
  windMultiplier: number;
}>): ModifierRegistry {
  const registry = new ModifierRegistry();

  // Research modifiers
  const completedSet = new Set(state.completedResearch);
  for (const node of researchTree) {
    if (completedSet.has(node.id)) {
      registry.register(researchToModifiers(node.id, node.effects));
    }
  }

  // Prestige modifiers
  registry.register(prestigeToModifiers(state.prestigeState.bonuses));

  // Mega project modifiers
  registry.register(megaProjectToModifiers(state.megaProjects));

  // Event modifiers
  registry.register(eventsToModifiers(state.activeEvents));

  // Weather modifiers
  registry.register(weatherToModifiers(state.weather, weatherDefs));

  // Worker modifiers (per-building, computed from worker assignments)
  const workersByBuilding = new Map<string, typeof state.workers>();
  for (const w of state.workers) {
    if (w.assignedTo) {
      const list = workersByBuilding.get(w.assignedTo);
      if (list) list.push(w);
      else workersByBuilding.set(w.assignedTo, [w]);
    }
  }
  // Workers contribute speed/efficiency/maintenance modifiers per-building
  // These are resolved separately in computeProduction since they're per-building

  return registry;
}

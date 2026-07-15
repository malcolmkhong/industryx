// Modifier type definitions: target union, source union, operation, and
// the atomic Modifier shape. Kept dependency-free so engine, registry, and
// source adapters all share a single canonical contract.

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

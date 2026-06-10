// ============================================
// Guest-to-Auth Migration Validator
// Validates guest save data before allowing
// migration to an authenticated Google account.
//
// Design Principles:
// - Guest plays locally (localStorage) — no server oversight
// - On first sign-in, local state uploads to cloud
// - Server validates whether the state is economically achievable
// - If validation fails: flag for review or reject migration
// - If validation passes: accept as initial cloud state
// - After migration: cloud is authoritative, delta checks active
// ============================================

import { BUILDING_DEFS, RESEARCH_TREE } from '@/lib/game/data';

// ─── Types ──────────────────────────────────────────────────────────────

export interface MigrationValidationResult {
  /** Overall pass/fail */
  isValid: boolean;
  /** Risk level of the migration */
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** Human-readable list of issues found */
  violations: string[];
  /** Detailed breakdown of each check */
  checks: MigrationCheckResult[];
  /** Recommended action */
  action: 'accept' | 'accept_with_flag' | 'reject' | 'reset';
  /** Summary for audit log */
  summary: string;
}

export interface MigrationCheckResult {
  name: string;
  passed: boolean;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  detail: string;
  actual?: number;
  maxAllowed?: number;
}

// ─── Game Constants for Validation ──────────────────────────────────────
// These must match the actual game mechanics.
// They are intentionally generous (2-5x actual maximums) to avoid
// false positives on legitimate power-users.

const STARTING_MONEY = 1000;

/**
 * Maximum income per tick under ideal conditions.
 *
 * Calculation (generous upper bound):
 * - 500 buildings at level 100 each
 * - Payout rates: extractorRate=20, factoryRate=50, powerRate=10
 * - All factories (most profitable): 500 × 100 × 50 = 2,500,000/tick
 * - With bonuses (prestige ×2, research ×1.5, events ×1.5): ~11,250,000/tick
 * - Round up to 15,000,000 for safety margin
 *
 * Note: This is per tick, NOT per real-time second.
 * Game speed just makes ticks fire faster — the values are the same per tick.
 */
const MAX_INCOME_PER_TICK = 15_000_000;

/**
 * Maximum research points earnable per tick.
 *
 * Calculation:
 * - Passive base: 0.5 RP/tick
 * - Per building RP (all 500 at T4 rate ×100): 500 × 100 × 0.20 = 10,000
 * - Per AI Lab bonus: 0.5 × 100 buildings = 50
 * - With bonuses: ~15,000 RP/tick
 * - Round up to 20,000 for safety
 */
const MAX_RP_PER_TICK = 20_000;

/**
 * Maximum number of buildings that can be built per tick
 * (accounting for earning money and spending it all on buildings).
 * This is a very generous upper bound.
 */
const MAX_BUILDINGS_PER_TICK = 5;

/**
 * Maximum research items that can be completed per tick.
 * Research takes time (ticks) to complete, so this is bounded.
 */
const MAX_RESEARCH_PER_TICK = 0.01; // 1 research per 100 ticks is very generous

/**
 * Time required to complete the cheapest research (basicAutomation: 30 ticks).
 * Any faster is impossible.
 */
const MIN_RESEARCH_TIME = 30;

/**
 * Maximum efficiency bonus from all sources combined.
 * Even with all research + prestige + workers + events, efficiency rarely exceeds 10x.
 */
const MAX_TOTAL_EFFICIENCY_MULTIPLIER = 15;

/**
 * Multiplier applied to theoretical maximums to give generous breathing room.
 * 3x means we allow up to 3x the theoretically possible maximum before flagging.
 * This prevents false positives while still catching obvious hackers.
 */
const GENEROSITY_MULTIPLIER = 3;

// ─── Research Prerequisite Map ──────────────────────────────────────────
// Built at module load time for O(1) lookups

interface ResearchInfo {
  cost: number;
  timeRequired: number;
  prerequisites: string[];
  unlocksBuildings: string[];
}

const RESEARCH_MAP = new Map<string, ResearchInfo>();
const BUILDING_UNLOCK_MAP = new Map<string, string>(); // buildingType → researchId

// Build the maps from the game data
for (const node of RESEARCH_TREE) {
  RESEARCH_MAP.set(node.id, {
    cost: node.cost,
    timeRequired: node.timeRequired,
    prerequisites: node.prerequisites,
    unlocksBuildings: node.effects
      .filter(e => e.type === 'unlockBuilding')
      .map(e => e.target!),
  });

  // Map each building unlock to its research requirement
  for (const eff of node.effects) {
    if (eff.type === 'unlockBuilding' && eff.target) {
      BUILDING_UNLOCK_MAP.set(eff.target, node.id);
    }
  }
}

// Also check BUILDING_DEFS for unlockRequirement fields
for (const [type, def] of Object.entries(BUILDING_DEFS)) {
  if (def.unlockRequirement?.research && !BUILDING_UNLOCK_MAP.has(type)) {
    BUILDING_UNLOCK_MAP.set(type, def.unlockRequirement.research);
  }
}

// ─── Cost Calculation Helpers ───────────────────────────────────────────

/**
 * Calculate the total money cost to build N buildings of a given type,
 * starting from count 0.
 * Uses geometric series: base × (multiplier^N - 1) / (multiplier - 1)
 */
function totalCostForNBuildings(baseCost: number, costMultiplier: number, count: number): number {
  if (count <= 0) return 0;
  if (costMultiplier === 1) return baseCost * count;
  return baseCost * (Math.pow(costMultiplier, count) - 1) / (costMultiplier - 1);
}

/**
 * Calculate total cost of all buildings in the game state,
 * including upgrade costs for each level.
 */
function calculateTotalBuildingCost(buildings: Array<Record<string, unknown>>): number {
  let total = 0;

  // Group buildings by type to calculate escalating costs
  const buildingsByType = new Map<string, number[]>();
  for (const b of buildings) {
    const type = String(b.type || '');
    const level = Number(b.level) || 1;
    if (!buildingsByType.has(type)) {
      buildingsByType.set(type, []);
    }
    buildingsByType.get(type)!.push(level);
  }

  for (const [type, levels] of buildingsByType) {
    const def = BUILDING_DEFS[type];
    if (!def) continue; // Unknown building type — will be caught by other checks

    const moneyCost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 0;
    const multiplier = def.costMultiplier;

    // Sort levels to calculate costs in build order
    levels.sort((a, b) => a - b);

    for (let i = 0; i < levels.length; i++) {
      // Cost to build the (i+1)th building of this type
      const buildCost = moneyCost * Math.pow(multiplier, i);
      total += buildCost;

      // Cost for each upgrade level (1 → current level)
      // Upgrade from level L to L+1 costs: baseCost × costMultiplier^L
      const targetLevel = levels[i];
      for (let l = 1; l < targetLevel; l++) {
        const upgradeCost = moneyCost * Math.pow(multiplier, l);
        total += upgradeCost;
      }
    }
  }

  return total;
}

/**
 * Calculate total RP cost of completed research.
 */
function calculateTotalResearchCost(completedResearch: string[]): number {
  let total = 0;
  for (const id of completedResearch) {
    const info = RESEARCH_MAP.get(id);
    if (info) {
      total += info.cost;
    }
  }
  return total;
}

/**
 * Calculate minimum ticks required to complete a set of research items
 * in sequential order (respecting prerequisites).
 * This is a lower bound — actual time depends on RP generation rate.
 */
function calculateMinResearchTicks(completedResearch: string[]): number {
  // Build a topological order of completed research
  const completed = new Set(completedResearch);
  let maxDepth = 0;

  function getDepth(id: string, visited: Set<string>): number {
    if (visited.has(id)) return 0; // Cycle protection
    visited.add(id);
    const info = RESEARCH_MAP.get(id);
    if (!info || !completed.has(id)) return 0;

    let prereqDepth = 0;
    for (const prereq of info.prerequisites) {
      if (completed.has(prereq)) {
        prereqDepth = Math.max(prereqDepth, getDepth(prereq, visited));
      }
    }

    return prereqDepth + info.timeRequired;
  }

  for (const id of completedResearch) {
    maxDepth = Math.max(maxDepth, getDepth(id, new Set()));
  }

  return maxDepth;
}

// ─── Main Validation Function ───────────────────────────────────────────

/**
 * Validate a guest save state before allowing migration to an authenticated account.
 *
 * This runs server-side when a guest first signs in with Google.
 * It checks whether the game state is economically achievable given
 * the game's rules, production rates, and time constraints.
 *
 * @param gameState - The full game state from localStorage
 * @returns Detailed validation result with recommended action
 */
export function validateGuestMigration(
  gameState: Record<string, unknown>,
): MigrationValidationResult {
  const violations: string[] = [];
  const checks: MigrationCheckResult[] = [];
  // Use a mutable type that TypeScript can't narrow — risk level is updated as checks run
  let overallRisk: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none' as 'none' | 'low' | 'medium' | 'high' | 'critical';

  // ── Extract state values ──
  const gameTick = Number(gameState.gameTick) || 0;
  const money = Number(gameState.money) || 0;
  const totalMoneyEarned = Number(gameState.totalMoneyEarned) || 0;
  const researchPoints = Number(gameState.researchPoints) || 0;
  const completedResearch = (gameState.completedResearch as string[]) || [];
  const buildings = (gameState.buildings as Array<Record<string, unknown>>) || [];
  const resources = (gameState.resources as Record<string, number>) || {};
  const gameSpeed = Number(gameState.gameSpeed) || 1;

  // ──────────────────────────────────────────────────────────────────
  // CHECK 1: Wealth-to-Time Ratio
  // Is totalMoneyEarned achievable within the recorded game ticks?
  // ──────────────────────────────────────────────────────────────────
  {
    const maxPossibleEarned = STARTING_MONEY + (MAX_INCOME_PER_TICK * gameTick * GENEROSITY_MULTIPLIER);
    const passed = totalMoneyEarned <= maxPossibleEarned;
    const severity: MigrationCheckResult['severity'] = passed ? 'none' : 'critical';

    if (!passed) {
      violations.push(
        `Wealth impossible for playtime: earned ${formatNum(totalMoneyEarned)} but max achievable is ${formatNum(maxPossibleEarned)} in ${formatNum(gameTick)} ticks`
      );
      overallRisk = 'critical';
    }

    checks.push({
      name: 'Wealth-to-Time Ratio',
      passed,
      severity,
      detail: passed
        ? `Total earned ${formatNum(totalMoneyEarned)} is within ${formatNum(maxPossibleEarned)} theoretical max for ${formatNum(gameTick)} ticks`
        : `Total earned ${formatNum(totalMoneyEarned)} exceeds ${formatNum(maxPossibleEarned)} theoretical max for ${formatNum(gameTick)} ticks`,
      actual: totalMoneyEarned,
      maxAllowed: maxPossibleEarned,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 2: Cost Consistency
  // Can the player afford everything they have?
  // Total spending (buildings + upgrades + research) ≤ totalMoneyEarned
  // ──────────────────────────────────────────────────────────────────
  {
    const buildingCost = calculateTotalBuildingCost(buildings);
    const researchCost = calculateTotalResearchCost(completedResearch);
    const totalSpent = buildingCost + researchCost;

    // Player can't spend more than they earned + what they currently have
    // Money earned = money spent + money remaining (approximately)
    // Allow generous margin for selling resources, contracts, etc.
    const maxAffordable = totalMoneyEarned * GENEROSITY_MULTIPLIER; // sold resources, contracts, etc.
    const passed = totalSpent <= maxAffordable;
    const severity: MigrationCheckResult['severity'] = !passed ? 'high' : 'none';

    if (!passed) {
      violations.push(
        `Spending exceeds income: spent ~${formatNum(totalSpent)} (buildings: ${formatNum(buildingCost)}, research: ${formatNum(researchCost)}) but only earned ${formatNum(totalMoneyEarned)}`
      );
      if (overallRisk === 'none' || overallRisk === 'low') overallRisk = 'high';
    }

    checks.push({
      name: 'Cost Consistency',
      passed,
      severity,
      detail: passed
        ? `Total spending ~${formatNum(totalSpent)} is within ${formatNum(maxAffordable)} earned (with margin)`
        : `Total spending ~${formatNum(totalSpent)} exceeds ${formatNum(maxAffordable)} possible from ${formatNum(totalMoneyEarned)} earned`,
      actual: totalSpent,
      maxAllowed: maxAffordable,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 3: Research Prerequisites
  // Does each completed research have its prerequisites met?
  // ──────────────────────────────────────────────────────────────────
  {
    const completed = new Set(completedResearch);
    let prereqViolations = 0;

    for (const id of completedResearch) {
      const info = RESEARCH_MAP.get(id);
      if (!info) continue;

      for (const prereq of info.prerequisites) {
        if (!completed.has(prereq)) {
          prereqViolations++;
        }
      }
    }

    const passed = prereqViolations === 0;
    const severity: MigrationCheckResult['severity'] = !passed ? 'critical' : 'none';

    if (!passed) {
      violations.push(
        `Research prerequisite violations: ${prereqViolations} research items completed without prerequisites`
      );
      overallRisk = 'critical';
    }

    checks.push({
      name: 'Research Prerequisites',
      passed,
      severity,
      detail: passed
        ? `All ${completedResearch.length} research items have valid prerequisites`
        : `${prereqViolations} research items completed without prerequisites`,
      actual: prereqViolations,
      maxAllowed: 0,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 4: Building Unlock Requirements
  // Does each building have its research unlock completed?
  // ──────────────────────────────────────────────────────────────────
  {
    const completed = new Set(completedResearch);
    let unlockViolations = 0;
    const violationTypes = new Set<string>();

    for (const b of buildings) {
      const type = String(b.type || '');
      const requiredResearch = BUILDING_UNLOCK_MAP.get(type);
      if (requiredResearch && !completed.has(requiredResearch)) {
        unlockViolations++;
        violationTypes.add(type);
      }
    }

    const passed = unlockViolations === 0;
    const severity: MigrationCheckResult['severity'] = !passed ? 'critical' : 'none';

    if (!passed) {
      violations.push(
        `Building unlock violations: ${unlockViolations} buildings (${[...violationTypes].slice(0, 5).join(', ')}) exist without required research`
      );
      overallRisk = 'critical';
    }

    checks.push({
      name: 'Building Unlock Requirements',
      passed,
      severity,
      detail: passed
        ? `All ${buildings.length} buildings have required research unlocked`
        : `${unlockViolations} buildings exist without required research (${[...violationTypes].slice(0, 5).join(', ')})`,
      actual: unlockViolations,
      maxAllowed: 0,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 5: Research Time Feasibility
  // Is it possible to complete all research within gameTick?
  // Research takes real ticks (not affected by speed).
  // ──────────────────────────────────────────────────────────────────
  {
    const minTicksForResearch = calculateMinResearchTicks(completedResearch);
    // Research can only run one at a time, so total ticks must be ≥ sum of research times
    // But some research can be done in parallel via different paths,
    // so we use the longest dependency chain (maxDepth) as the lower bound
    const passed = gameTick >= minTicksForResearch * 0.5; // Allow 50% margin for overlapping research
    const severity: MigrationCheckResult['severity'] = !passed ? 'high' : 'none';

    if (!passed) {
      violations.push(
        `Research time impossible: minimum ${formatNum(minTicksForResearch)} ticks needed but only ${formatNum(gameTick)} ticks recorded`
      );
      if (overallRisk === 'none' || overallRisk === 'low') overallRisk = 'high';
    }

    checks.push({
      name: 'Research Time Feasibility',
      passed,
      severity,
      detail: passed
        ? `${completedResearch.length} research items feasible within ${formatNum(gameTick)} ticks (min needed: ${formatNum(minTicksForResearch)})`
        : `${completedResearch.length} research items need minimum ${formatNum(minTicksForResearch)} ticks but only ${formatNum(gameTick)} ticks recorded`,
      actual: gameTick,
      maxAllowed: minTicksForResearch,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 6: RP-to-Time Ratio
  // Could the player have earned enough RP for all completed research?
  // ──────────────────────────────────────────────────────────────────
  {
    const totalResearchCost = calculateTotalResearchCost(completedResearch);
    const maxPossibleRP = MAX_RP_PER_TICK * gameTick * GENEROSITY_MULTIPLIER;
    // Current RP + spent RP must be ≤ earned RP
    const totalRPAccounted = researchPoints + totalResearchCost;
    const passed = totalRPAccounted <= maxPossibleRP + totalResearchCost * 0.5; // Allow 50% margin for completion refunds
    const severity: MigrationCheckResult['severity'] = !passed ? 'high' : 'none';

    if (!passed) {
      violations.push(
        `RP impossible for playtime: needs ${formatNum(totalRPAccounted)} RP but max earnable is ${formatNum(maxPossibleRP)} in ${formatNum(gameTick)} ticks`
      );
      if (overallRisk === 'none' || overallRisk === 'low') overallRisk = 'high';
    }

    checks.push({
      name: 'RP-to-Time Ratio',
      passed,
      severity,
      detail: passed
        ? `Total RP ${formatNum(totalRPAccounted)} is within theoretical max ${formatNum(maxPossibleRP)} for ${formatNum(gameTick)} ticks`
        : `Total RP ${formatNum(totalRPAccounted)} exceeds theoretical max ${formatNum(maxPossibleRP)} for ${formatNum(gameTick)} ticks`,
      actual: totalRPAccounted,
      maxAllowed: maxPossibleRP,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 7: Building Count Reasonableness
  // Is the number of buildings reasonable for the playtime?
  // ──────────────────────────────────────────────────────────────────
  {
    // Even at max income, you can only build so many buildings per tick
    const maxBuildings = Math.min(500, gameTick * MAX_BUILDINGS_PER_TICK * GENEROSITY_MULTIPLIER);
    const passed = buildings.length <= maxBuildings || gameTick === 0;
    const severity: MigrationCheckResult['severity'] = !passed ? 'high' : 'none';

    if (!passed) {
      violations.push(
        `Too many buildings: ${buildings.length} buildings in ${formatNum(gameTick)} ticks (max reasonable: ${formatNum(maxBuildings)})`
      );
      if (overallRisk === 'none' || overallRisk === 'low') overallRisk = 'high';
    }

    checks.push({
      name: 'Building Count Reasonableness',
      passed,
      severity,
      detail: passed
        ? `${buildings.length} buildings is reasonable for ${formatNum(gameTick)} ticks`
        : `${buildings.length} buildings exceeds ${formatNum(maxBuildings)} reasonable max for ${formatNum(gameTick)} ticks`,
      actual: buildings.length,
      maxAllowed: maxBuildings,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 8: Resource Capacity Check
  // Are resource amounts within storage capacity?
  // ──────────────────────────────────────────────────────────────────
  {
    const resourceCapacity = (gameState.resourceCapacity as Record<string, number>) || {};
    let capacityViolations = 0;

    for (const [key, value] of Object.entries(resources)) {
      if (typeof value !== 'number' || value < 0) continue;
      const capacity = resourceCapacity[key];
      // If no capacity defined, use a generous default
      const maxAllowed = capacity ? capacity * GENEROSITY_MULTIPLIER : 1e12;
      if (value > maxAllowed) {
        capacityViolations++;
      }
    }

    const passed = capacityViolations === 0;
    const severity: MigrationCheckResult['severity'] = !passed ? 'medium' : 'none';

    if (!passed) {
      violations.push(
        `Resource capacity violations: ${capacityViolations} resources exceed storage capacity`
      );
      if (overallRisk === 'none') overallRisk = 'medium';
    }

    checks.push({
      name: 'Resource Capacity',
      passed,
      severity,
      detail: passed
        ? 'All resources within storage capacity'
        : `${capacityViolations} resources exceed storage capacity`,
      actual: capacityViolations,
      maxAllowed: 0,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 9: Game Speed Validity
  // ──────────────────────────────────────────────────────────────────
  {
    const allowedSpeeds = [1, 2, 5, 10];
    const passed = allowedSpeeds.includes(gameSpeed);
    const severity: MigrationCheckResult['severity'] = !passed ? 'critical' : 'none';

    if (!passed) {
      violations.push(`Invalid game speed: ${gameSpeed}`);
      overallRisk = 'critical';
    }

    checks.push({
      name: 'Game Speed Validity',
      passed,
      severity,
      detail: passed
        ? `Game speed ${gameSpeed}x is valid`
        : `Game speed ${gameSpeed}x is invalid (allowed: ${allowedSpeeds.join(', ')})`,
      actual: gameSpeed,
      maxAllowed: 10,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // CHECK 10: Money Consistency
  // Current money should never exceed totalMoneyEarned (rough check)
  // ──────────────────────────────────────────────────────────────────
  {
    // money can exceed totalMoneyEarned through selling resources, contracts, etc.
    // But it shouldn't be wildly higher. Allow 5x margin for market income.
    const passed = money <= totalMoneyEarned * 5 + STARTING_MONEY;
    const severity: MigrationCheckResult['severity'] = !passed ? 'high' : 'none';

    if (!passed) {
      violations.push(
        `Money exceeds total earned: ${formatNum(money)} vs ${formatNum(totalMoneyEarned)} earned`
      );
      if (overallRisk === 'none' || overallRisk === 'low') overallRisk = 'high';
    }

    checks.push({
      name: 'Money Consistency',
      passed,
      severity,
      detail: passed
        ? `Current money ${formatNum(money)} is reasonable vs ${formatNum(totalMoneyEarned)} earned`
        : `Current money ${formatNum(money)} exceeds ${formatNum(totalMoneyEarned)} earned (even with 5x market margin)`,
      actual: money,
      maxAllowed: totalMoneyEarned * 5 + STARTING_MONEY,
    });
  }

  // ── Determine action ──
  let action: MigrationValidationResult['action'];

  if (overallRisk === 'critical') {
    action = 'reject';
  } else if (overallRisk === 'high') {
    // High risk: reject the migration — state is clearly manipulated
    action = 'reject';
  } else if (overallRisk === 'medium') {
    // Medium risk: accept but flag for admin review
    action = 'accept_with_flag';
  } else if (overallRisk === 'low') {
    action = 'accept_with_flag';
  } else {
    action = 'accept';
  }

  // ── Build summary ──
  const failedChecks = checks.filter(c => !c.passed);
  const summary = failedChecks.length === 0
    ? `Guest migration VALID: ${buildings.length} buildings, ${completedResearch.length} research, ${formatNum(totalMoneyEarned)} earned in ${formatNum(gameTick)} ticks`
    : `Guest migration ${action.toUpperCase()}: ${failedChecks.length}/${checks.length} checks failed (${failedChecks.map(c => c.name).join(', ')})`;

  return {
    isValid: overallRisk === 'none' || overallRisk === 'low',
    riskLevel: overallRisk,
    violations,
    checks,
    action,
    summary,
  };
}

// ─── Utility ────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

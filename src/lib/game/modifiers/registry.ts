// ModifierRegistry: holds active modifiers, provides efficient target lookup,
// and includes the top-level `buildModifierRegistry` orchestration that
// fans out to per-source adapters (research, prestige, mega, events, weather).

import type { Modifier, ModifierSource, ModifierTarget } from "./types";
import { researchToModifiers } from "./sources/research";
import { prestigeToModifiers } from "./sources/prestige";
import { megaProjectToModifiers } from "./sources/megaProjects";
import { eventsToModifiers } from "./sources/events";
import { weatherToModifiers } from "./sources/weather";

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

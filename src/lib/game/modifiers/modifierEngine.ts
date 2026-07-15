// Modifier engine compatibility barrel.
// Domain pieces live in types.ts, engine.ts, registry.ts, and sources/*.

export type {
  Modifier,
  ModifierOperation,
  ModifierSource,
  ModifierTarget,
} from "./types";
export { ModifierEngine } from "./engine";
export { ModifierRegistry, buildModifierRegistry } from "./registry";
export { researchToModifiers } from "./sources/research";
export { prestigeToModifiers } from "./sources/prestige";
export { megaProjectToModifiers } from "./sources/megaProjects";
export { eventsToModifiers } from "./sources/events";
export { weatherToModifiers } from "./sources/weather";

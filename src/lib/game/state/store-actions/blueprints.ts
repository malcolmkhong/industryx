// ============================================
// blueprints.ts — barrel
//
// Re-exports `createBlueprintActions` from the split module.
// Split subfolder:
//   • blueprintMutation    — CRUD + apply actions (orchestration)
//   • blueprintSerialization — encode/decode share codes (pure)
//   • blueprintValidation  — bounds + type checks (pure, M8 FIX)
//   • blueprintUiEffects   — notification helpers (side-effects only)
// ============================================

import type { SetFn, GetFn } from "./_actionTypes";
import { createBlueprintUiEffects } from "./blueprints/blueprintUiEffects";
import { createBlueprintMutationActions } from "./blueprints/blueprintMutation";

export function createBlueprintActions(set: SetFn, get: GetFn) {
  const effects = createBlueprintUiEffects(get);
  return createBlueprintMutationActions(set, get, effects);
}
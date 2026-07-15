// ============================================
// automation.ts — barrel
//
// Re-exports `createAutomationActions` from the split modules.
// Split subfolder:
//   - automationClientAction — validation + state mutation
//   - automationUiEffects   — notification + sound side effects
// ============================================

import type { SetFn, GetFn } from "./_actionTypes";
import { createAutomationClientAction } from "./automation/automationClientAction";
import { createAutomationUiEffects } from "./automation/automationUiEffects";

export function createAutomationActions(set: SetFn, get: GetFn) {
  const effects = createAutomationUiEffects(get);
  return createAutomationClientAction(set, get, effects);
}

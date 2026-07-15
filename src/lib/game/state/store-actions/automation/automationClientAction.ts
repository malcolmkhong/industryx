// ============================================
// automationClientAction.ts
//
// Pure client-side automation activation. Performs local unlock
// validation and applies the state mutation. All notification + sound
// calls go through the injected `effects` interface, so the
// mutation here stays free of UI / side-effect imports.
// ============================================

import { RESEARCH_TREE } from "../../../config/configCache";
import type { SetFn, GetFn } from "../_actionTypes";
import type { AutomationUiEffects } from "./automationUiEffects";

export function createAutomationClientAction(
  set: SetFn,
  get: GetFn,
  effects: AutomationUiEffects,
) {
  return {
    activateAutomation: (type: string) => {
      const state = get();
      const unlock = state.automationUnlocks.find((a) => a.type === type);
      if (!unlock || unlock.active) return;

      if (
        unlock.requiresResearch &&
        !state.completedResearch.includes(unlock.requiresResearch)
      ) {
        const researchName = RESEARCH_TREE.find(
          (r) => r.id === unlock.requiresResearch,
        )?.name;
        effects.notifyMissingResearch(researchName);
        return;
      }

      if (state.prestigeState.corporationPoints < unlock.cost) {
        effects.notifyInsufficientCorpPoints(unlock.cost);
        return;
      }

      set({
        prestigeState: {
          ...state.prestigeState,
          corporationPoints: state.prestigeState.corporationPoints - unlock.cost,
        },
        automationUnlocks: state.automationUnlocks.map((a) =>
          a.type === type ? { ...a, active: true } : a,
        ),
      });
      effects.playAutomationSound();
      effects.notifyAutomationActivated(unlock.name);
    },
  };
}

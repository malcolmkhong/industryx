// ============================================
// automationUiEffects.ts
//
// UI side-effects for the automation action: notification messages
// and sound playback. Pure of mutation — these helpers only emit
// observable events. Wired by automationClientAction.ts via the
// factory's `effects` parameter.
// ============================================

import { soundEngine } from "../../../audio/soundEngine";
import type { GetFn } from "../_actionTypes";

export interface AutomationUiEffects {
  notifyAutomationActivated(unlockName: string): void;
  notifyMissingResearch(researchName: string | undefined): void;
  notifyInsufficientCorpPoints(cost: number): void;
  playAutomationSound(): void;
}

export function createAutomationUiEffects(get: GetFn): AutomationUiEffects {
  return {
    notifyAutomationActivated(unlockName) {
      get().addNotification("success", `Activated: ${unlockName}!`);
    },
    notifyMissingResearch(researchName) {
      get().addNotification(
        "error",
        `Requires research: ${researchName ?? "?"}`,
      );
    },
    notifyInsufficientCorpPoints(cost) {
      get().addNotification("error", `Need ${cost} Corporation Points!`);
    },
    playAutomationSound() {
      soundEngine.play("levelUp", "events");
    },
  };
}

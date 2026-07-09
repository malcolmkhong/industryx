import type { GameNotification } from '../types';
import { RESEARCH_TREE } from '../configCache';
import { soundEngine } from '../soundEngine';
import type { SetFn, GetFn } from "./_actionTypes";

export function createAutomationActions(set: SetFn, get: GetFn) {
  return {
    activateAutomation: (type: string) => {
      const state = get();
      const unlock = state.automationUnlocks.find(a => a.type === type);
      if (!unlock || unlock.active) return;

      if (unlock.requiresResearch && !state.completedResearch.includes(unlock.requiresResearch)) {
        get().addNotification('error', `Requires research: ${RESEARCH_TREE.find(r => r.id === unlock.requiresResearch)?.name}`);
        return;
      }

      if (state.prestigeState.corporationPoints < unlock.cost) {
        get().addNotification('error', `Need ${unlock.cost} Corporation Points!`);
        return;
      }

      set({
        prestigeState: {
          ...state.prestigeState,
          corporationPoints: state.prestigeState.corporationPoints - unlock.cost,
        },
        automationUnlocks: state.automationUnlocks.map(a =>
          a.type === type ? { ...a, active: true } : a
        ),
      });
      soundEngine.play('levelUp', 'events');
      get().addNotification('success', `Activated: ${unlock.name}!`);
    },
  };
}

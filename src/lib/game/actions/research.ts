import type { GameNotification } from '../types';
import { RESEARCH_TREE } from '../configCache';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { isResearchUnlocked } from '../utils/costCalculator';
import { soundEngine } from '../soundEngine';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createResearchActions(set: SetFn, get: GetFn) {
  return {
    startResearch: async (id: string) => {
      const state = get();
      if (state.activeResearch) {
        get().addNotification('warning', 'Research already in progress!');
        return;
      }

      const node = RESEARCH_TREE.find(r => r.id === id);
      if (!node) return;

      if (state.completedResearch.includes(id)) {
        get().addNotification('warning', 'Already researched!');
        return;
      }

      if (!isResearchUnlocked(id, state.completedResearch)) {
        get().addNotification('error', 'Prerequisites not met!');
        return;
      }

      if (state.researchPoints < node.cost) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', `Need ${formatNumber(node.cost)} RP! Have ${formatNumber(state.researchPoints)}`);
        return;
      }

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('research', { researchId: id }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', validation.error ?? `Research "${node.name}" rejected by server`);
        return;
      }

      set({
        researchPoints: state.researchPoints - node.cost,
        activeResearch: id,
        researchProgress: 0,
      });
      soundEngine.play('buttonClick', 'ui');
      get().addNotification('info', `Started research: ${node.name}`);
      get().updateQuestProgress('research', 1);
    },
  };
}

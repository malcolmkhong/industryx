// ============================================
// News & Anti-Cheat Actions Factory
// ============================================
import { getLLMState } from '../newsLLM';
import type { SetFn, GetFn } from "./_actionTypes";

export function createNewsActions(set: SetFn, get: GetFn) {
  return {
    // Phase 7.3: Client-side divergence detection.
    divergesFromExpected: (serverComputedMax: number) => {
      const state = get();
      if (serverComputedMax <= 0) return false;
      const ratio = state.money / serverComputedMax;
      return ratio > 1.1;
    },

    getNewsLLMState: () => getLLMState(),

    refreshNewsFromLLM: (updates: Array<{ id: string; title: string; description: string; textSource?: string }>) => {
      const state = get();
      const updatedNews = state.marketNews.map((n: any) => {
        const update = updates.find((u: any) => u.id === n.id);
        if (update) {
          return { ...n, title: update.title, description: update.description, textSource: 'llm' as const };
        }
        return n;
      });
      set({ marketNews: updatedNews });
    },

  };
}

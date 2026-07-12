// ============================================
// News & Anti-Cheat Actions Factory
// ============================================
import { getLLMState } from '../../market/news/newsLLM';
import type { MarketNews } from "../../market/marketSimulator";
import type { SetFn, GetFn } from "./_actionTypes";

interface NewsLLMUpdate {
  id: string;
  title: string;
  description: string;
  textSource?: string;
}

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

    refreshNewsFromLLM: (updates: NewsLLMUpdate[]) => {
      const state = get();
      const updatedNews = state.marketNews.map((n: MarketNews) => {
        const update = updates.find((u) => u.id === n.id);
        if (update) {
          return { ...n, title: update.title, description: update.description, textSource: 'llm' as const };
        }
        return n;
      });
      set({ marketNews: updatedNews });
    },

  };
}

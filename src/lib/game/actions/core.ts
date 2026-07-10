// ============================================
// Core Actions Factory
// ============================================
import type { GameState, GameTab } from '../types';
import { generateId } from '../utils/generateId';
import type { SetFn, GetFn } from "./_actionTypes";

export function createCoreActions(set: SetFn, get: GetFn) {
  return {
    // C4 FIX: Validate game speed against allowed values before setting.
    setGameSpeed: async (speed: number) => {
      const ALLOWED_SPEEDS = [1, 2, 5, 10] as const;
      if (!ALLOWED_SPEEDS.includes(speed as typeof ALLOWED_SPEEDS[number])) {
        console.warn(`[Security] Invalid game speed ${speed} rejected. Allowed: ${ALLOWED_SPEEDS.join(', ')}`);
        return;
      }

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('set_game_speed', { speed }, generateId())
      );
      if (!validation.approved) {
        console.warn(`[Security] Server rejected game speed ${speed}:`, validation.error);
        get().addNotification('error', validation.error ?? 'Game speed change rejected by server');
        return;
      }

      set({ gameSpeed: speed });
    },
    togglePause: () => set((state: GameState) => ({ paused: !state.paused })),
    setActiveTab: (tab: GameTab) => set({ activeTab: tab }),
  };
}

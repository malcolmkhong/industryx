// ============================================
// Core Actions Factory
// ============================================
import type { GameTab } from '../../shared/types/types';
import { generateId } from '../../shared/utils/generateId';
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

      const validation = await import('../../actions/client/actionValidator').then(m =>
        m.validateActionWithServer('set_game_speed', { speed }, generateId())
      );
      if (!validation.approved) {
        console.warn(`[Security] Server rejected game speed ${speed}:`, validation.error);
        get().addNotification('error', validation.error ?? 'Game speed change rejected by server');
        return;
      }

      set({ gameSpeed: speed });
    },
    // C-009 (BUILDING_PRODUCTION_AUDIT §10.6 P1, 2026-07-16):
    // The pause button was client-only and the server tick runner
    // ignored `state.paused`, so toggling it gave a false sense of
    // control. Removed from the store; the UI button and keyboard
    // shortcut are also removed. Product can reintroduce a
    // server-authoritative pause as a future mechanic.
    setActiveTab: (tab: GameTab) => set({ activeTab: tab }),
  };
}

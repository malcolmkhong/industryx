import type { GameNotification } from '../../shared/types/types';
import { generateId } from '../../shared/utils/generateId';
import type { SetFn, GetFn } from "./_actionTypes";

export function createNotificationActions(set: SetFn, get: GetFn) {
  return {
    addNotification: (type: GameNotification['type'], message: string) => {
      const state = get();
      set({
        notifications: [{ id: generateId(), type, message, gameTick: state.gameTick, read: false }, ...state.notifications].slice(0, 30),
      });
    },

    clearNotifications: () => set({ notifications: [] }),

    markNotificationRead: (id: string) => {
      set(state => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, read: true } : n
        ),
      }));
    },

    markAllNotificationsRead: () => {
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, read: true })),
      }));
    },
  };
}

import type { GameNotification } from '../types';
import { generateId } from '../utils/generateId';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

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

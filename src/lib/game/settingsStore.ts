// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Settings Store - Persisted to localStorage
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NumberFormat = 'scientific' | 'standard' | 'compact';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';
export type SpeedLimit = 1 | 5 | 10 | 0; // 0 = unlimited

export interface NotificationFilters {
  success: boolean;
  warning: boolean;
  error: boolean;
  info: boolean;
}

export interface SoundCategories {
  building: number;
  production: number;
  events: number;
  ui: number;
}

export interface SettingsState {
  // Game Settings
  autoSave: boolean;
  autoSaveInterval: number; // seconds, 10-120
  speedLimit: SpeedLimit;
  numberFormat: NumberFormat;
  notificationFilters: NotificationFilters;

  // Sound Settings
  masterVolume: number; // 0-100
  soundCategories: SoundCategories;
  soundEnabled: boolean;

  // Display Settings
  floatingNumbers: boolean;
  toastNotifications: boolean;
  scanLineEffect: boolean;
  backgroundGrid: boolean;
  animationSpeed: AnimationSpeed;
  reducedMotion: boolean; // respects prefers-reduced-motion

  // Meta
  _version: number;
}

interface SettingsActions {
  // Game Settings
  setAutoSave: (v: boolean) => void;
  setAutoSaveInterval: (v: number) => void;
  setSpeedLimit: (v: SpeedLimit) => void;
  setNumberFormat: (v: NumberFormat) => void;
  setNotificationFilter: (type: keyof NotificationFilters, v: boolean) => void;

  // Sound Settings
  setMasterVolume: (v: number) => void;
  setSoundCategoryVolume: (category: keyof SoundCategories, v: number) => void;
  setSoundEnabled: (v: boolean) => void;
  muteAll: () => void;

  // Display Settings
  setFloatingNumbers: (v: boolean) => void;
  setToastNotifications: (v: boolean) => void;
  setScanLineEffect: (v: boolean) => void;
  setBackgroundGrid: (v: boolean) => void;
  setAnimationSpeed: (v: AnimationSpeed) => void;
  setReducedMotion: (v: boolean) => void;

  // Reset
  resetSettings: () => void;
}

const initialState: SettingsState = {
  autoSave: true,
  autoSaveInterval: 30,
  speedLimit: 0,
  numberFormat: 'standard',
  notificationFilters: {
    success: true,
    warning: true,
    error: true,
    info: true,
  },

  masterVolume: 50,
  soundCategories: {
    building: 70,
    production: 50,
    events: 80,
    ui: 60,
  },
  soundEnabled: true,

  floatingNumbers: true,
  toastNotifications: true,
  scanLineEffect: true,
  backgroundGrid: true,
  animationSpeed: 'normal',
  reducedMotion: false,

  _version: 1,
};

export type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...initialState,

      // Game Settings
      setAutoSave: (v) => set({ autoSave: v }),
      setAutoSaveInterval: (v) => set({ autoSaveInterval: Math.max(10, Math.min(120, v)) }),
      setSpeedLimit: (v) => set({ speedLimit: v }),
      setNumberFormat: (v) => set({ numberFormat: v }),
      setNotificationFilter: (type, v) =>
        set((state) => ({
          notificationFilters: { ...state.notificationFilters, [type]: v },
        })),

      // Sound Settings
      setMasterVolume: (v) => set({ masterVolume: Math.max(0, Math.min(100, v)) }),
      setSoundCategoryVolume: (category, v) =>
        set((state) => ({
          soundCategories: {
            ...state.soundCategories,
            [category]: Math.max(0, Math.min(100, v)),
          },
        })),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      muteAll: () => set({ masterVolume: 0, soundEnabled: false }),

      // Display Settings
      setFloatingNumbers: (v) => set({ floatingNumbers: v }),
      setToastNotifications: (v) => set({ toastNotifications: v }),
      setScanLineEffect: (v) => set({ scanLineEffect: v }),
      setBackgroundGrid: (v) => set({ backgroundGrid: v }),
      setAnimationSpeed: (v) => set({ animationSpeed: v }),
      setReducedMotion: (v) => set({ reducedMotion: v }),

      // Reset
      resetSettings: () => set({ ...initialState }),
    }),
    {
      name: 'factory-dominion-settings',
    }
  )
);

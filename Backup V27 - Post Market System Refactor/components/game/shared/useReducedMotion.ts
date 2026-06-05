'use client';

import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '@/lib/game/settingsStore';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Returns true if the user has requested reduced motion via OS/browser settings
 * OR via the in-game settings toggle.
 * Uses useSyncExternalStore for the OS preference to avoid hydration mismatches.
 */
export function useReducedMotion(): boolean {
  // Check OS-level preference (SSR-safe via useSyncExternalStore)
  const systemPrefersReduced = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Check user's in-game setting
  const userSetting = useSettingsStore(state => state.reducedMotion);
  return systemPrefersReduced || userSetting;
}

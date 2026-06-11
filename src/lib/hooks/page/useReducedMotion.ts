import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/game/settingsStore';

// Syncs the settingsStore.reducedMotion flag to the <body> class so CSS rules
// (e.g. .reduce-motion * { animation: none !important }) can disable animations.
export function useReducedMotion(): void {
  const reducedMotion = useSettingsStore(state => state.reducedMotion);
  useEffect(() => {
    document.body.classList.toggle('reduce-motion', reducedMotion);
  }, [reducedMotion]);
}

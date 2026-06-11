import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/game/store';

// Hydration guard: Zustand persist rehydrates from localStorage on the client,
// so the first server-rendered output would mismatch. This hook delays the
// `mounted` flag until hydration finishes (or 3s safety fallback).
export function useHydrationGuard(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (useGameStore.persist.hasHydrated()) {
      queueMicrotask(() => setMounted(true));
      return;
    }
    const unsubFinishHydration = useGameStore.persist.onFinishHydration(() => {
      setMounted(true);
    });
    const safetyTimer = setTimeout(() => setMounted(true), 3000);
    return () => {
      unsubFinishHydration();
      clearTimeout(safetyTimer);
    };
  }, []);
  return mounted;
}

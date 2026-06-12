'use client';

import { useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/lib/game/store';

/**
 * Manages conflict resolution state and logic for cloud sync.
 *
 * After Phase 02.2 migration (STATE_VERSION_CONFLICT flow), the cloud
 * is always authoritative. resolveConflict is kept for backwards compat
 * but should rarely be called — when it is, cloud wins.
 */
export function useConflictResolution(saveToCloud: () => Promise<{ success: boolean; error?: string }>) {
  const [pendingConflict, setPendingConflict] = useState<{
    localTick: number;
    cloudTick: number;
    localMoney: number;
    cloudMoney: number;
  } | null>(null);
  const cloudDataRef = useRef<unknown>(null);

  const resolveConflict = useCallback(
    async (choice: 'local' | 'cloud'): Promise<{ success: boolean; error?: string }> => {
      setPendingConflict(null);

      // After migration: cloud always wins. This function is kept for
      // backwards compat but should rarely be called anymore.
      if (choice === 'cloud' && cloudDataRef.current) {
        try {
          useGameStore.getState().importSave(JSON.stringify(cloudDataRef.current));
        } catch {
          // If import fails, keep current state
        }
        cloudDataRef.current = null;
        return { success: true };
      }

      // If somehow "local" is chosen after migration, still save to cloud
      cloudDataRef.current = null;
      return saveToCloud();
    },
    [saveToCloud]
  );

  return {
    pendingConflict,
    setPendingConflict,
    cloudDataRef,
    resolveConflict,
  };
}

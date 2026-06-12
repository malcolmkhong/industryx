'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameStore } from '@/lib/game/store';
import { useBlockedState } from './useBlockedState';
import { useServerAuthority } from './useServerAuthority';
import { useCloudPersistence } from './useCloudPersistence';
import { useConflictResolution } from './useConflictResolution';
import { AUTO_SAVE_INTERVAL } from './types';
import type { CloudSyncState } from './types';

/**
 * Cloud sync hook with guest-to-auth migration support.
 *
 * Facade that composes focused sub-hooks into the unified CloudSyncState.
 *
 * Flow:
 * 1. Guest plays locally (localStorage) — no server involvement
 * 2. Guest signs in with Google → first-time migration
 * 3. Migration endpoint validates guest save data against game rules
 * 4. If valid → guest data becomes initial cloud state
 * 5. After migration → cloud is ALWAYS authoritative
 * 6. Conflict resolution: cloud always wins (after first migration)
 */
export function useCloudSync(): CloudSyncState {
  const { user } = useAuth();

  // ── State hooks ───────────────────────────────────────────────────
  const { blockedState, setBlockedState } = useBlockedState();
  const {
    serverStateHash,
    serverStateVersion,
    isServerAuthoritative,
    setServerStateHash,
    setServerStateVersion,
    setIsServerAuthoritative,
  } = useServerAuthority();

  // ── Persistence (save, load, migrate) ─────────────────────────────
  const {
    isSyncing,
    isSyncingState,
    isMigrating,
    lastSyncAt,
    lastAutoSaveAt,
    lastSavedGameTick,
    setLastAutoSaveAtState,
    lastSyncAtState,
    lastAutoSaveAtState,
    migrationResult,
    saveToCloud,
    loadFromCloud,
    migrateGuestToCloud,
  } = useCloudPersistence({
    user,
    serverStateHash,
    serverStateVersion,
    isServerAuthoritative,
    setBlockedState,
    setServerStateHash,
    setServerStateVersion,
    setIsServerAuthoritative,
  });

  // ── Conflict resolution ──────────────────────────────────────────
  const { pendingConflict, resolveConflict } = useConflictResolution(saveToCloud);

  // ── Auto-load / migrate on first login ───────────────────────────
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!user || initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      const loadResult = await loadFromCloud();

      if (loadResult.isNew) {
        // First-time login — migrate guest save to cloud
        await migrateGuestToCloud();
        // Result is handled inside migrateGuestToCloud (sets state, blockedState, etc.)
      } else if (loadResult.success && loadResult.data && loadResult.conflict === 'cloud') {
        // Returning user — apply authoritative cloud state locally
        try {
          useGameStore.getState().importSave(JSON.stringify(loadResult.data));
        } catch {
          // If import fails, local state stays
        }
      }
    })();
  }, [user, loadFromCloud, migrateGuestToCloud]);

  // ── Auto-save every 2 minutes ────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      if (isSyncing.current || isMigrating) return;

      const currentGameTick = useGameStore.getState().gameTick;

      if (
        lastSavedGameTick.current !== null &&
        lastSavedGameTick.current === currentGameTick
      ) {
        return; // No state change since last save
      }

      const result = await saveToCloud();
      if (result.success) {
        lastAutoSaveAt.current = Date.now();
        setLastAutoSaveAtState(lastAutoSaveAt.current);
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [user, saveToCloud, isMigrating]);

  return {
    saveToCloud,
    loadFromCloud,
    lastSyncAt: lastSyncAtState,
    lastAutoSaveAt: lastAutoSaveAtState,
    isSyncing: isSyncingState,
    resolveConflict,
    pendingConflict,
    serverStateHash,
    serverStateVersion,
    isServerAuthoritative,
    blockedState,
    migrationResult,
    isMigrating,
  };
}

'use client';

import { useCallback, useRef, useState } from 'react';
import type { CloudBlockState, MigrationResult } from './types';
import { extractGameState } from './serializeGameState';
import { useGameStore } from '@/lib/game/store';

interface PersistenceDeps {
  user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null;
  serverStateHash: string | null;
  serverStateVersion: number | null;
  isServerAuthoritative: boolean;
  setBlockedState: React.Dispatch<React.SetStateAction<CloudBlockState | null>>;
  setServerStateHash: React.Dispatch<React.SetStateAction<string | null>>;
  setServerStateVersion: React.Dispatch<React.SetStateAction<number | null>>;
  setIsServerAuthoritative: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Manages local sync state (isSyncing, timing refs) and the
 * guest-to-auth migration path. saveToCloud / loadFromCloud are
 * provided by the dedicated useCloudSave / useCloudLoad hooks,
 * composed by the facade (index.ts).
 */
export function useCloudPersistence(deps: PersistenceDeps) {
  const {
    user,
    setBlockedState,
    setServerStateHash,
    setIsServerAuthoritative,
  } = deps;

  // ── Sync state ──────────────────────────────────────────────────
  const isSyncing = useRef(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // ── Timing refs ──────────────────────────────────────────────────
  const lastSyncAt = useRef<number | null>(null);
  const [lastSyncAtState, setLastSyncAtState] = useState<number | null>(null);
  const lastAutoSaveAt = useRef<number | null>(null);
  const [lastAutoSaveAtState, setLastAutoSaveAtState] = useState<number | null>(null);
  const lastSavedGameTick = useRef<number | null>(null);

  // ── Guest-to-Auth Migration ──────────────────────────────────────
  const migrateGuestToCloud = useCallback(async (): Promise<MigrationResult> => {
    if (!user) return { migrated: false, action: 'reject', reason: 'Not authenticated' };

    setIsMigrating(true);
    try {
      const gameState = extractGameState();

      const res = await fetch('/api/auth/migrate-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          gameState,
          displayName:
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            'Commander',
        }),
      });

      if (!res.ok && res.status !== 200) {
        return {
          migrated: false,
          action: 'reject',
          reason: `Server error: ${res.status}`,
        };
      }

      const data: MigrationResult = await res.json();
      setMigrationResult(data);

      if (data.migrated) {
        // Migration succeeded — cloud is now authoritative
        setIsServerAuthoritative(true);
        if (data.stateHash) {
          setServerStateHash(data.stateHash);
        }
        lastSyncAt.current = Date.now();
        lastSavedGameTick.current = useGameStore.getState().gameTick;
        setLastSyncAtState(lastSyncAt.current);
      } else if (data.action === 'reset') {
        // Migration rejected — reset to starting state
        if (data.resetState) {
          useGameStore.getState().resetGame();
        }
        setIsServerAuthoritative(true);
        setBlockedState({
          isBlocked: true,
          reason:
            data.reason ||
            'Guest save data failed validation. Your progress has been reset.',
          code: 'MIGRATION_REJECTED',
          detectedAt: Date.now(),
        });
      } else if (data.action === 'use_cloud') {
        // Cloud state already exists — cloud is authoritative
        setIsServerAuthoritative(true);
        const loadResult = await fetch(`/api/game/state?userId=${user.id}`);
        if (loadResult.ok) {
          const loadData = await loadResult.json();
          if (loadData.data?.fullState) {
            try {
              useGameStore
                .getState()
                .importSave(JSON.stringify(loadData.data.fullState));
            } catch {
              // If import fails, local state stays
            }
          }
          if (loadData.data?.stateHash) {
            setServerStateHash(loadData.data.stateHash);
          }
        }
        lastSyncAt.current = Date.now();
        setLastSyncAtState(lastSyncAt.current);
      }

      return data;
    } catch (err) {
      const result: MigrationResult = {
        migrated: false,
        action: 'reject',
        reason: err instanceof Error ? err.message : 'Network error during migration',
      };
      setMigrationResult(result);
      return result;
    } finally {
      setIsMigrating(false);
    }
  }, [user, setBlockedState, setServerStateHash, setIsServerAuthoritative]);

  // ──────────────────────────────────────────────────────────────
  // saveToCloud and loadFromCloud are now provided by the
  // dedicated useCloudSave / useCloudLoad hooks, composed by the
  // facade (index.ts). This hook only manages local sync state
  // and the guest-to-auth migration path.
  // ──────────────────────────────────────────────────────────────

  return {
    isSyncing,
    isSyncingState,
    setIsSyncingState,
    isMigrating,
    lastSyncAt,
    lastAutoSaveAt,
    lastSavedGameTick,
    setLastAutoSaveAtState,
    lastSyncAtState,
    setLastSyncAtState,
    lastAutoSaveAtState,
    migrationResult,
    migrateGuestToCloud,
  };
}

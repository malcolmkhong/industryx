'use client';

import { useCallback, useRef, useState } from 'react';
import type { CloudBlockState, CloudSyncState, MigrationResult } from './types';
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
 * Contains the core cloud persistence operations: save, load, and
 * guest-to-auth migration. Receives state values and setters from
 * the facade (index.ts) for cross-hook coordination.
 */
export function useCloudPersistence(deps: PersistenceDeps) {
  const {
    user,
    serverStateHash,
    serverStateVersion,
    setBlockedState,
    setServerStateHash,
    setServerStateVersion,
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

  // ── Save to Cloud ───────────────────────────────────────────────
  const saveToCloud = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!user) return { success: false, error: 'Not authenticated' };
    if (isSyncing.current) return { success: false, error: 'Already syncing' };

    isSyncing.current = true;
    setIsSyncingState(true);
    try {
      const gameState = extractGameState();

      const res = await fetch('/api/game/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          gameState,
          clientChecksum: serverStateHash || undefined,
          clientStateVersion: serverStateVersion ?? undefined,
        }),
      });

      // ── 400 VALIDATION / CHECKSUM / ACCOUNT_LOCKED ──────────
      if (res.status === 400) {
        const data = await res.json();
        if (data.code === 'VALIDATION_FAILED') {
          setBlockedState({
            isBlocked: true,
            reason:
              data.violations?.join(', ') ||
              'Save validation failed — your game state may have been modified incorrectly.',
            code: 'VALIDATION_FAILED',
            detectedAt: Date.now(),
          });
          return {
            success: false,
            error: `Save rejected: ${data.violations?.join(', ') || 'validation failed'}`,
          };
        }
        if (data.code === 'CHECKSUM_MISMATCH') {
          setBlockedState({
            isBlocked: true,
            reason:
              'Your game data checksum does not match the server. This may indicate data corruption or tampering.',
            code: 'VALIDATION_FAILED',
            detectedAt: Date.now(),
          });
          return { success: false, error: 'Checksum mismatch — please reload from server' };
        }
        if (data.code === 'ACCOUNT_LOCKED') {
          const reason = data.reason || 'Account locked for suspicious activity';
          setBlockedState({
            isBlocked: true,
            reason,
            code: 'ACCOUNT_LOCKED',
            detectedAt: Date.now(),
          });
          return { success: false, error: reason };
        }
      }

      // ── 409 STATE_VERSION_CONFLICT ──────────────────────────
      if (res.status === 409) {
        const conflictData = await res.json();
        if (conflictData.code === 'STATE_VERSION_CONFLICT') {
          const serverState = conflictData.serverState as
            | { fullState?: Record<string, unknown>; stateVersion?: number; stateHash?: string }
            | undefined;
          if (serverState?.fullState) {
            try {
              useGameStore.getState().importSave(JSON.stringify(serverState.fullState));
            } catch {
              // If import fails, local state stays
            }
          }
          if (serverState?.stateVersion) {
            setServerStateVersion(serverState.stateVersion);
          }
          if (serverState?.stateHash) {
            setServerStateHash(serverState.stateHash);
          }
          setBlockedState({
            isBlocked: true,
            reason: 'Your local state was behind the server. Synced to server version.',
            code: 'MIGRATION_REJECTED',
            detectedAt: Date.now(),
          });
          return { success: false, error: 'Server state was newer — synced to server version' };
        }
      }

      // ── 401 SESSION_EXPIRED ─────────────────────────────────
      if (res.status === 401) {
        setBlockedState({
          isBlocked: true,
          reason: 'Your session has expired. Please sign in again to continue cloud sync.',
          code: 'SESSION_EXPIRED',
          detectedAt: Date.now(),
        });
        return { success: false, error: 'Session expired. Please sign in again.' };
      }

      // ── 403 ACCESS_DENIED ───────────────────────────────────
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'ACCOUNT_LOCKED') {
          const reason = data.reason || 'Account locked for suspicious activity';
          setBlockedState({
            isBlocked: true,
            reason,
            code: 'ACCOUNT_LOCKED',
            detectedAt: Date.now(),
          });
          return { success: false, error: reason };
        }
        setBlockedState({
          isBlocked: true,
          reason: 'Access denied — you do not have permission to use cloud sync.',
          code: 'ACCESS_DENIED',
          detectedAt: Date.now(),
        });
        return { success: false, error: 'Access denied.' };
      }

      // ── Success ─────────────────────────────────────────────
      const data = await res.json();
      if (data.saved) {
        lastSyncAt.current = Date.now();
        lastSavedGameTick.current = useGameStore.getState().gameTick;
        setLastSyncAtState(lastSyncAt.current);
        if (data.stateHash) {
          setServerStateHash(data.stateHash);
        }
        if (data.stateVersion) {
          setServerStateVersion(data.stateVersion);
        }
        setIsServerAuthoritative(true);
        setBlockedState(null);
        return { success: true };
      }

      // ── Fallback to legacy player endpoint ──────────────────
      const fallbackRes = await fetch('/api/player', {
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

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.saved) {
          lastSyncAt.current = Date.now();
          lastSavedGameTick.current = useGameStore.getState().gameTick;
          setLastSyncAtState(lastSyncAt.current);
          return { success: true };
        }
      }

      return { success: false, error: data.error || 'Save failed' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    } finally {
      isSyncing.current = false;
      setIsSyncingState(false);
    }
  }, [
    user,
    serverStateHash,
    serverStateVersion,
    setBlockedState,
    setServerStateHash,
    setServerStateVersion,
    setIsServerAuthoritative,
  ]);

  // ── Load from Cloud ─────────────────────────────────────────────
  const loadFromCloud = useCallback(async (): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    isNew?: boolean;
    conflict?: 'local' | 'cloud';
  }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      const res = await fetch(`/api/game/state?userId=${user.id}`);

      // ── 401 SESSION_EXPIRED ─────────────────────────────────
      if (res.status === 401) {
        setBlockedState({
          isBlocked: true,
          reason: 'Your session has expired. Please sign in again to continue cloud sync.',
          code: 'SESSION_EXPIRED',
          detectedAt: Date.now(),
        });
        return { success: false, error: 'Session expired. Please sign in again.' };
      }

      // ── 403 ACCESS_DENIED ───────────────────────────────────
      if (res.status === 403) {
        const data = await res.json();
        if (data.code === 'ACCOUNT_LOCKED') {
          const reason = data.reason || 'Account locked for suspicious activity';
          setBlockedState({
            isBlocked: true,
            reason,
            code: 'ACCOUNT_LOCKED',
            detectedAt: Date.now(),
          });
          return { success: false, error: reason };
        }
        setBlockedState({
          isBlocked: true,
          reason: 'Access denied — you do not have permission to use cloud sync.',
          code: 'ACCESS_DENIED',
          detectedAt: Date.now(),
        });
        return { success: false, error: 'Access denied.' };
      }

      const data = await res.json();

      if (data.isNew) {
        return { success: true, isNew: true };
      }

      if (data.data?.fullState) {
        const cloudState = data.data.fullState as Record<string, unknown>;
        const localState = useGameStore.getState();
        const cloudTick = (data.data.gameTick as number) || 0;
        const localTick = localState.gameTick;
        const cloudMoney = (data.data.money as number) || 0;
        const localMoney = localState.money;

        if (data.data.stateHash) {
          setServerStateHash(data.data.stateHash);
        }
        if (data.data.stateVersion) {
          setServerStateVersion(data.data.stateVersion);
        }
        setIsServerAuthoritative(true);

        // ── Cloud always wins after first migration ─────────
        if (cloudTick > 0) {
          lastSyncAt.current = Date.now();
          setLastSyncAtState(lastSyncAt.current);
          return { success: true, data: cloudState, conflict: 'cloud' };
        }

        lastSyncAt.current = Date.now();
        setLastSyncAtState(lastSyncAt.current);
        return {
          success: true,
          data: cloudState,
          conflict: localTick > 0 ? 'cloud' : undefined,
        };
      }

      // ── Fallback to legacy player endpoint ──────────────────
      const fallbackRes = await fetch(`/api/player?userId=${user.id}`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.isNew) {
          return { success: true, isNew: true };
        }
        if (fallbackData.data?.game_state) {
          const cloudState = fallbackData.data.game_state as Record<string, unknown>;
          const cloudTick = (cloudState.gameTick as number) || 0;

          setIsServerAuthoritative(true);

          lastSyncAt.current = Date.now();
          setLastSyncAtState(lastSyncAt.current);
          return {
            success: true,
            data: cloudState,
            conflict: cloudTick > 0 ? 'cloud' : undefined,
          };
        }
      }

      return { success: false, error: 'No game state found' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }, [user, setBlockedState, setServerStateHash, setServerStateVersion, setIsServerAuthoritative]);

  return {
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
  };
}

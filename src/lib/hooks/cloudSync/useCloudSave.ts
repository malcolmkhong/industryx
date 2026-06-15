// ============================================
// Cloud Sync — useCloudSave
// ============================================
//
// Encapsulates the saveToCloud logic. Handles:
//   - /api/game/state POST (authoritative server_game_state endpoint)
//   - 400/401/403/409 response → mapHttpErrorToBlock
//   - 409 STATE_VERSION_CONFLICT → apply server state locally
//   - Fallback to legacy /api/player endpoint
//   - isSyncing ref guard (prevents concurrent saves)
//   - Updates serverStateHash + serverStateVersion + isServerAuthoritative
// ============================================

import { useCallback, useRef } from 'react';
import { useGameStore } from '@/lib/game/store';
import { extractGameState } from './serializeGameState';
import { mapSaveErrorToBlock } from './mapHttpErrorToBlock';
import type { ServerAuthority, SyncResult, CloudBlockState } from './types';

interface UseCloudSaveOptions {
  userId: string | null;
  isSyncingRef: React.MutableRefObject<boolean>;
  setIsSyncingState: (syncing: boolean) => void;
  serverAuthority: ServerAuthority;
  setServerAuthority: (auth: ServerAuthority) => void;
  setBlockedState: (blocked: CloudBlockState | null) => void;
}

export function useCloudSave(opts: UseCloudSaveOptions) {
  const { userId, isSyncingRef, setIsSyncingState, serverAuthority, setServerAuthority, setBlockedState } = opts;

  const saveToCloud = useCallback(async (): Promise<SyncResult> => {
    if (!userId) return { success: false, error: 'Not authenticated' };
    if (isSyncingRef.current) return { success: false, error: 'Already syncing' };

    isSyncingRef.current = true;
    setIsSyncingState(true);
    try {
      const gameState = extractGameState();
      const { serverStateHash, serverStateVersion } = serverAuthority;

      const res = await fetch('/api/game/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          gameState,
          clientChecksum: serverStateHash || undefined,
          clientStateVersion: serverStateVersion ?? undefined,
        }),
      });

      if (res.status === 409) {
        const conflictData = await res.json();
        if (conflictData.code === 'STATE_VERSION_CONFLICT') {
          const serverState = conflictData.serverState as {
            fullState?: Record<string, unknown>;
            stateVersion?: number;
            stateHash?: string;
          } | undefined;
          if (serverState?.fullState) {
            try {
              useGameStore.getState().importSave(JSON.stringify(serverState.fullState));
            } catch {
              // If import fails, local state stays
            }
          }
          setServerAuthority({
            serverStateHash: serverState?.stateHash ?? serverStateHash,
            serverStateVersion: serverState?.stateVersion ?? serverStateVersion,
            isServerAuthoritative: true,
          });
          setBlockedState({
            isBlocked: true,
            reason: 'Your local state was behind the server. Synced to server version.',
            code: 'MIGRATION_REJECTED',
            detectedAt: Date.now(),
          });
          return { success: false, error: 'Server state was newer — synced to server version' };
        }
      }

      if (res.status >= 400) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const mapping = mapSaveErrorToBlock(res.status, body);
        if (mapping) {
          setBlockedState(mapping.blocked);
          return { success: false, error: mapping.userMessage };
        }
        return { success: false, error: `Server error: ${res.status}` };
      }

      const data = await res.json();

      // Phase 7.3: Handle server-side validation warnings.
      // Server may accept the save but flag suspicious state (e.g., money exceeding
      // expected maximum). This provides immediate user feedback and prevents
      // continued play with potentially manipulated state.
      if (data.validation_warning) {
        console.warn('[CloudSave] Server validation warning:', data.validation_warning);
        useGameStore.getState().addNotification(
          'warning',
          `⚠️ Sync warning: ${String(data.validation_warning)}`,
        );
        setBlockedState({
          isBlocked: true,
          reason: `Server validation warning: ${String(data.validation_warning)}`,
          code: 'VALIDATION_FAILED',
          detectedAt: Date.now(),
        });
      }

      if (data.saved) {
        setServerAuthority({
          serverStateHash: (data.stateHash as string | undefined) ?? serverStateHash,
          serverStateVersion: (data.stateVersion as number | undefined) ?? serverStateVersion,
          isServerAuthoritative: true,
        });
        // Clear blocked state on successful sync (block was temporary or resolved)
        setBlockedState(null);
        return { success: true };
      }

      // Fallback to legacy player endpoint
      const fallbackRes = await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          gameState,
          displayName: 'Commander',
        }),
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.saved) return { success: true };
      }
      return { success: false, error: (data.error as string | undefined) || 'Save failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    } finally {
      isSyncingRef.current = false;
      setIsSyncingState(false);
    }
  }, [userId, isSyncingRef, setIsSyncingState, serverAuthority, setServerAuthority, setBlockedState]);

  return { saveToCloud };
}

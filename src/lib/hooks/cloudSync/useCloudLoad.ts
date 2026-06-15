// ============================================
// Cloud Sync — useCloudLoad
// ============================================
//
// Encapsulates the loadFromCloud logic. Handles:
//   - /api/game/state GET (authoritative server_game_state endpoint)
//   - 401/403 response → mapHttpErrorToBlock
//   - isNew (no cloud state yet) detection
//   - Cloud-always-wins policy (Phase 02.2: after first migration,
//     server is the only source of truth)
//   - Updates serverStateHash + serverStateVersion + isServerAuthoritative
//   - Fallback to legacy /api/player endpoint
// ============================================

import { useCallback } from 'react';
import { useGameStore } from '@/lib/game/store';
import { mapLoadErrorToBlock } from './mapHttpErrorToBlock';
import type { ServerAuthority, LoadResult, CloudBlockState } from './types';

interface UseCloudLoadOptions {
  userId: string | null;
  serverAuthority: ServerAuthority;
  setServerAuthority: (auth: ServerAuthority) => void;
  setBlockedState: (blocked: CloudBlockState | null) => void;
}

export function useCloudLoad(opts: UseCloudLoadOptions) {
  const { userId, serverAuthority, setServerAuthority, setBlockedState } = opts;

  const loadFromCloud = useCallback(async (): Promise<LoadResult> => {
    if (!userId) return { success: false, error: 'Not authenticated' };

    try {
      const res = await fetch(`/api/game/state?userId=${userId}`);

      if (res.status >= 400) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const mapping = mapLoadErrorToBlock(res.status, body);
        if (mapping) {
          setBlockedState(mapping.blocked);
          return { success: false, error: mapping.userMessage };
        }
      }

      const data = await res.json();

      if (data.isNew) return { success: true, isNew: true };

      if (data.data?.fullState) {
        const cloudState = data.data.fullState as Record<string, unknown>;
        const localState = useGameStore.getState();
        const cloudTick = (data.data.gameTick as number) || 0;
        const localTick = localState.gameTick;

        setServerAuthority({
          serverStateHash: (data.data.stateHash as string | undefined) ?? serverAuthority.serverStateHash,
          serverStateVersion: (data.data.stateVersion as number | undefined) ?? serverAuthority.serverStateVersion,
          isServerAuthoritative: true,
        });

        // ── After first migration: CLOUD ALWAYS WINS ──
        if (cloudTick > 0) {
          return { success: true, data: cloudState, conflict: 'cloud' };
        }

        // Edge case: cloud tick is 0 but has state (shouldn't happen, but handle gracefully)
        return { success: true, data: cloudState, conflict: localTick > 0 ? 'cloud' : undefined };
      }

      // Fallback to legacy player endpoint
      const fallbackRes = await fetch(`/api/player?userId=${userId}`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.isNew) return { success: true, isNew: true };
        if (fallbackData.data?.game_state) {
          const cloudState = fallbackData.data.game_state as Record<string, unknown>;
          const cloudTick = (cloudState.gameTick as number) || 0;
          setServerAuthority({ ...serverAuthority, isServerAuthoritative: true });
          return { success: true, data: cloudState, conflict: cloudTick > 0 ? 'cloud' : undefined };
        }
      }

      return { success: false, error: 'No game state found' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, [userId, serverAuthority, setServerAuthority, setBlockedState]);

  return { loadFromCloud };
}

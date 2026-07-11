"use client";

/**
 * Cloud sync hook — Phase 5 passive facade.
 *
 * Exposes the same CloudSyncState shape as before, but no longer makes auth
 * decisions. The orchestrator owns load/save timing. This hook only:
 *   - subscribes to the CloudSyncService for state changes
 *   - exposes service methods to React consumers
 *
 * Behavior change:
 *   - isNew branch removed (per Q5). Server is always authoritative.
 *   - migrate-guest path removed entirely (per Q5).
 *   - auto-save driven by orchestrator, not this hook.
 */

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useContext,
  createContext,
} from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { useGameStore, applyServerState } from "@/lib/game/store";
import { extractGameState } from "./serializeGameState";
import { CloudSyncService } from "./CloudSyncService";
import type { CloudSyncState, SyncResult, LoadResult } from "./types";

const CloudSyncCtx = createContext<{ service: CloudSyncService } | null>(null);

export const CloudSyncServiceProvider = CloudSyncCtx.Provider;
export { CloudSyncService };

export function useCloudSync(): CloudSyncState {
  const ctx = useContext(CloudSyncCtx);
  if (!ctx) {
    throw new Error(
      "useCloudSync must be used within CloudSyncServiceProvider",
    );
  }
  const { service } = ctx;
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    service.setUserId(userId);
  }, [service, userId]);

  const snapshot = useSyncExternalStore(
    (cb) => service.subscribe(cb),
    () => service.getState(),
    () => service.getState(),
  );

  // Pending conflict stays null until Phase 6 (merge flow owns this).
  const [pendingConflict] = useState<CloudSyncState["pendingConflict"]>(null);
  const resolveConflict = async (): Promise<SyncResult> => ({ success: true });

  const saveToCloud = useMemo(
    () => () =>
      service.save(
        () => useGameStore.getState().gameTick,
        () => extractGameState(),
      ),
    [service],
  );

  // Phase 5.5: best-effort save on tab close / visibility change.
  // Reuses the service-level isSyncing guard — concurrent triggers
  // (auto-save + manual + unload) cannot collide.
  const flushSaveOnUnload = useMemo(
    () => () =>
      service.flushSaveOnUnload(
        () => useGameStore.getState().gameTick,
        () => extractGameState(),
      ),
    [service],
  );

  const loadFromCloud = useMemo(
    () => async (): Promise<LoadResult> => {
      const r = await service.load();
      if (r.success && r.data && r.conflict === "cloud") {
        try {
          applyServerState(r.data);
        } catch {
          // local state stays untouched on apply failure
        }
      }
      return r;
    },
    [service],
  );

  return {
    saveToCloud,
    flushSaveOnUnload,
    loadFromCloud,
    lastSyncAt: snapshot.lastSyncAt,
    lastAutoSaveAt: snapshot.lastAutoSaveAt,
    isSyncing: snapshot.isSyncing,
    resolveConflict,
    pendingConflict,
    serverStateHash: snapshot.serverStateHash,
    serverStateVersion: snapshot.serverStateVersion,
    isServerAuthoritative: snapshot.isServerAuthoritative,
    blockedState: snapshot.blockedState,
  } satisfies CloudSyncState;
}

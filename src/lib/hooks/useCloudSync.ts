'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameStore } from '@/lib/game/store';

export interface CloudBlockState {
  isBlocked: boolean;
  reason: string;
  code: 'ACCOUNT_LOCKED' | 'ACCESS_DENIED' | 'SESSION_EXPIRED' | 'VALIDATION_FAILED' | 'NETWORK_ERROR';
  detectedAt: number;
}

interface CloudSyncState {
  saveToCloud: () => Promise<{ success: boolean; error?: string }>;
  loadFromCloud: () => Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean; conflict?: 'local' | 'cloud' }>;
  lastSyncAt: number | null;
  lastAutoSaveAt: number | null;
  isSyncing: boolean;
  resolveConflict: (choice: 'local' | 'cloud') => Promise<{ success: boolean; error?: string }>;
  pendingConflict: { localTick: number; cloudTick: number; localMoney: number; cloudMoney: number } | null;
  serverStateHash: string | null;
  isServerAuthoritative: boolean;
  blockedState: CloudBlockState | null;
}

// Auto-save interval in milliseconds (increased to 2 minutes to reduce Supabase load)
const AUTO_SAVE_INTERVAL = 120_000;

export function useCloudSync(): CloudSyncState {
  const { user } = useAuth();
  const isSyncing = useRef(false);
  const lastSyncAt = useRef<number | null>(null);
  const lastAutoSaveAt = useRef<number | null>(null);
  const lastSavedGameTick = useRef<number | null>(null);
  const [lastAutoSaveAtState, setLastAutoSaveAtState] = useState<number | null>(null);
  const [lastSyncAtState, setLastSyncAtState] = useState<number | null>(null);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<CloudSyncState['pendingConflict']>(null);
  const [serverStateHash, setServerStateHash] = useState<string | null>(null);
  const [isServerAuthoritative, setIsServerAuthoritative] = useState(false);
  const [blockedState, setBlockedState] = useState<CloudBlockState | null>(null);
  const cloudDataRef = useRef<unknown>(null);
  const initialLoadDone = useRef(false);

  const saveToCloud = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };
    if (isSyncing.current) return { success: false, error: 'Already syncing' };

    isSyncing.current = true;
    setIsSyncingState(true);
    try {
      const state = useGameStore.getState();
      const gameState = {
        money: state.money,
        totalMoneyEarned: state.totalMoneyEarned,
        gameTick: state.gameTick,
        buildings: state.buildings,
        resources: state.resources,
        resourceCapacity: state.resourceCapacity,
        transportLines: state.transportLines,
        powerGrid: state.powerGrid,
        researchPoints: state.researchPoints,
        completedResearch: state.completedResearch,
        activeResearch: state.activeResearch,
        researchProgress: state.researchProgress,
        workers: state.workers,
        market: state.market,
        contracts: state.contracts,
        completedContracts: state.completedContracts,
        automationUnlocks: state.automationUnlocks,
        prestigeState: state.prestigeState,
        activeEvents: state.activeEvents,
        stats: state.stats,
        megaProjects: state.megaProjects,
        blueprints: state.blueprints,
        autoSellResources: state.autoSellResources,
        storageUpgradeLevels: state.storageUpgradeLevels,
        lastOnlineTimestamp: state.lastOnlineTimestamp,
        loginStreak: state.loginStreak,
        weather: state.weather,
        quests: state.quests,
        payoutConfig: state.payoutConfig,
        pendingPayout: state.pendingPayout,
        payoutHistory: state.payoutHistory,
        trackedQuest: state.trackedQuest,
        drones: state.drones,
        notifications: state.notifications,
        gameSpeed: state.gameSpeed,
        paused: state.paused,
      } as Record<string, unknown>;

      // Try the authoritative server_game_state endpoint first
      const res = await fetch('/api/game/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          gameState,
          clientChecksum: serverStateHash || undefined,
        }),
      });

      if (res.status === 400) {
        const data = await res.json();
        if (data.code === 'VALIDATION_FAILED') {
          // Server rejected the save — state is invalid
          setBlockedState({ isBlocked: true, reason: data.violations?.join(', ') || 'Save validation failed — your game state may have been modified incorrectly.', code: 'VALIDATION_FAILED', detectedAt: Date.now() });
          return { success: false, error: `Save rejected: ${data.violations?.join(', ') || 'validation failed'}` };
        }
        if (data.code === 'CHECKSUM_MISMATCH') {
          setBlockedState({ isBlocked: true, reason: 'Your game data checksum does not match the server. This may indicate data corruption or tampering.', code: 'VALIDATION_FAILED', detectedAt: Date.now() });
          return { success: false, error: 'Checksum mismatch — please reload from server' };
        }
        if (data.code === 'ACCOUNT_LOCKED') {
          const reason = data.reason || 'Account locked for suspicious activity';
          setBlockedState({ isBlocked: true, reason, code: 'ACCOUNT_LOCKED', detectedAt: Date.now() });
          return { success: false, error: reason };
        }
      }

      if (res.status === 401) {
        setBlockedState({ isBlocked: true, reason: 'Your session has expired. Please sign in again to continue cloud sync.', code: 'SESSION_EXPIRED', detectedAt: Date.now() });
        return { success: false, error: 'Session expired. Please sign in again.' };
      }
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'ACCOUNT_LOCKED') {
          const reason = data.reason || 'Account locked for suspicious activity';
          setBlockedState({ isBlocked: true, reason, code: 'ACCOUNT_LOCKED', detectedAt: Date.now() });
          return { success: false, error: reason };
        }
        setBlockedState({ isBlocked: true, reason: 'Access denied — you do not have permission to use cloud sync.', code: 'ACCESS_DENIED', detectedAt: Date.now() });
        return { success: false, error: 'Access denied.' };
      }

      const data = await res.json();
      if (data.saved) {
        lastSyncAt.current = Date.now();
        lastSavedGameTick.current = state.gameTick;
        setLastSyncAtState(lastSyncAt.current);
        if (data.stateHash) {
          setServerStateHash(data.stateHash);
        }
        setIsServerAuthoritative(true);
        // Clear blocked state on successful sync (block was temporary or resolved)
        setBlockedState(null);
        return { success: true };
      }

      // Fallback to legacy player endpoint
      const fallbackRes = await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          gameState,
          displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Commander',
        }),
      });

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.saved) {
          lastSyncAt.current = Date.now();
          lastSavedGameTick.current = state.gameTick;
          setLastSyncAtState(lastSyncAt.current);
          return { success: true };
        }
      }

      return { success: false, error: data.error || 'Save failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    } finally {
      isSyncing.current = false;
      setIsSyncingState(false);
    }
  }, [user, serverStateHash]);

  const loadFromCloud = useCallback(async (): Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean; conflict?: 'local' | 'cloud' }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      // Try the authoritative server_game_state endpoint first
      const res = await fetch(`/api/game/state?userId=${user.id}`);

      if (res.status === 401) {
        setBlockedState({ isBlocked: true, reason: 'Your session has expired. Please sign in again to continue cloud sync.', code: 'SESSION_EXPIRED', detectedAt: Date.now() });
        return { success: false, error: 'Session expired. Please sign in again.' };
      }
      if (res.status === 403) {
        const data = await res.json();
        if (data.code === 'ACCOUNT_LOCKED') {
          const reason = data.reason || 'Account locked for suspicious activity';
          setBlockedState({ isBlocked: true, reason, code: 'ACCOUNT_LOCKED', detectedAt: Date.now() });
          return { success: false, error: reason };
        }
        setBlockedState({ isBlocked: true, reason: 'Access denied — you do not have permission to use cloud sync.', code: 'ACCESS_DENIED', detectedAt: Date.now() });
        return { success: false, error: 'Access denied.' };
      }

      const data = await res.json();

      if (data.isNew) {
        return { success: true, isNew: true };
      }

      if (data.data?.fullState) {
        const cloudState = data.data.fullState as Record<string, unknown>;
        const localState = useGameStore.getState();
        const cloudTick = data.data.gameTick as number || 0;
        const localTick = localState.gameTick;
        const cloudMoney = data.data.money as number || 0;
        const localMoney = localState.money;

        // Store the server state hash for future checksum validation
        if (data.data.stateHash) {
          setServerStateHash(data.data.stateHash);
        }
        setIsServerAuthoritative(true);

        // Conflict resolution: compare gameTick
        if (localTick > 0 && cloudTick > 0) {
          const tickRatio = cloudTick / localTick;

          if (tickRatio < 0.9) {
            lastSyncAt.current = Date.now();
            setLastSyncAtState(lastSyncAt.current);
            return { success: true, data: cloudState, conflict: 'local' };
          } else if (tickRatio > 1.1) {
            lastSyncAt.current = Date.now();
            setLastSyncAtState(lastSyncAt.current);
            return { success: true, data: cloudState, conflict: 'cloud' };
          } else {
            setPendingConflict({ localTick, cloudTick, localMoney, cloudMoney });
            cloudDataRef.current = cloudState;
            lastSyncAt.current = Date.now();
            setLastSyncAtState(lastSyncAt.current);
            return { success: true, data: cloudState };
          }
        }

        if (cloudTick > 0 && localTick === 0) {
          return { success: true, data: cloudState, conflict: 'cloud' };
        }
        if (localTick > 0 && cloudTick === 0) {
          return { success: true, data: cloudState, conflict: 'local' };
        }

        lastSyncAt.current = Date.now();
        setLastSyncAtState(lastSyncAt.current);
        return { success: true, data: cloudState };
      }

      // Fallback to legacy player endpoint
      const fallbackRes = await fetch(`/api/player?userId=${user.id}`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.isNew) {
          return { success: true, isNew: true };
        }
        if (fallbackData.data?.game_state) {
          const cloudState = fallbackData.data.game_state as Record<string, unknown>;
          const localState = useGameStore.getState();
          const cloudTick = (cloudState.gameTick as number) || 0;
          const localTick = localState.gameTick;
          const cloudMoney = (cloudState.money as number) || 0;
          const localMoney = localState.money;

          if (localTick > 0 && cloudTick > 0) {
            const tickRatio = cloudTick / localTick;
            if (tickRatio < 0.9) {
              lastSyncAt.current = Date.now();
              setLastSyncAtState(lastSyncAt.current);
              return { success: true, data: cloudState, conflict: 'local' };
            } else if (tickRatio > 1.1) {
              lastSyncAt.current = Date.now();
              setLastSyncAtState(lastSyncAt.current);
              return { success: true, data: cloudState, conflict: 'cloud' };
            } else {
              setPendingConflict({ localTick, cloudTick, localMoney, cloudMoney });
              cloudDataRef.current = cloudState;
              lastSyncAt.current = Date.now();
              setLastSyncAtState(lastSyncAt.current);
              return { success: true, data: cloudState };
            }
          }

          if (cloudTick > 0 && localTick === 0) {
            return { success: true, data: cloudState, conflict: 'cloud' };
          }
          if (localTick > 0 && cloudTick === 0) {
            return { success: true, data: cloudState, conflict: 'local' };
          }

          lastSyncAt.current = Date.now();
          setLastSyncAtState(lastSyncAt.current);
          return { success: true, data: cloudState };
        }
      }

      return { success: false, error: 'No game state found' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, [user]);

  const resolveConflict = useCallback(async (choice: 'local' | 'cloud'): Promise<{ success: boolean; error?: string }> => {
    setPendingConflict(null);

    if (choice === 'cloud' && cloudDataRef.current) {
      cloudDataRef.current = null;
      return { success: true };
    }

    cloudDataRef.current = null;
    return saveToCloud();
  }, [saveToCloud]);

  // Auto-load from server on login (first load only)
  useEffect(() => {
    if (!user || initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      const result = await loadFromCloud();
      if (result.success && result.data && result.conflict === 'cloud') {
        // Auto-apply cloud state if it's ahead
        try {
          useGameStore.getState().importSave(JSON.stringify(result.data));
        } catch {
          // If import fails, the local state stays
        }
      }
    })();
  }, [user, loadFromCloud]);

  // Auto-save effect: every 2 minutes, save if logged in and state has changed
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      if (isSyncing.current) return;

      const currentGameTick = useGameStore.getState().gameTick;

      if (lastSavedGameTick.current !== null && lastSavedGameTick.current === currentGameTick) {
        return;
      }

      const result = await saveToCloud();
      if (result.success) {
        lastAutoSaveAt.current = Date.now();
        setLastAutoSaveAtState(lastAutoSaveAt.current);
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [user, saveToCloud]);

  return {
    saveToCloud,
    loadFromCloud,
    lastSyncAt: lastSyncAtState,
    lastAutoSaveAt: lastAutoSaveAtState,
    isSyncing: isSyncingState,
    resolveConflict,
    pendingConflict,
    serverStateHash,
    isServerAuthoritative,
    blockedState,
  };
}

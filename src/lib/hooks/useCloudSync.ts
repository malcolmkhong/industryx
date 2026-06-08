'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameStore } from '@/lib/game/store';

interface CloudSyncState {
  saveToCloud: () => Promise<{ success: boolean; error?: string }>;
  loadFromCloud: () => Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean; conflict?: 'local' | 'cloud' }>;
  lastSyncAt: number | null;
  lastAutoSaveAt: number | null;
  isSyncing: boolean;
  resolveConflict: (choice: 'local' | 'cloud') => Promise<{ success: boolean; error?: string }>;
  pendingConflict: { localTick: number; cloudTick: number; localMoney: number; cloudMoney: number } | null;
}

// Auto-save interval in milliseconds (60 seconds)
const AUTO_SAVE_INTERVAL = 60_000;

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
  const cloudDataRef = useRef<unknown>(null);

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

      const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Commander';

      const res = await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, gameState, displayName }),
      });

      if (res.status === 401) {
        return { success: false, error: 'Session expired. Please sign in again.' };
      }
      if (res.status === 403) {
        return { success: false, error: 'Access denied. You can only save your own data.' };
      }

      const data = await res.json();
      if (data.saved) {
        lastSyncAt.current = Date.now();
        lastSavedGameTick.current = state.gameTick;
        setLastSyncAtState(lastSyncAt.current);
        return { success: true };
      }
      return { success: false, error: data.error || 'Save failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    } finally {
      isSyncing.current = false;
      setIsSyncingState(false);
    }
  }, [user]);

  const loadFromCloud = useCallback(async (): Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean; conflict?: 'local' | 'cloud' }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      const res = await fetch(`/api/player?userId=${user.id}`);

      if (res.status === 401) {
        return { success: false, error: 'Session expired. Please sign in again.' };
      }
      if (res.status === 403) {
        return { success: false, error: 'Access denied.' };
      }

      const data = await res.json();

      if (data.isNew) {
        return { success: true, isNew: true };
      }

      if (data.data?.game_state) {
        const cloudState = data.data.game_state as Record<string, unknown>;
        const localState = useGameStore.getState();
        const cloudTick = (cloudState.gameTick as number) || 0;
        const localTick = localState.gameTick;
        const cloudMoney = (cloudState.money as number) || 0;
        const localMoney = localState.money;

        // Conflict resolution: compare gameTick (progress indicator)
        // If cloud is significantly behind local (< 90% of local tick), auto-resolve to local
        // If cloud is significantly ahead (> 110% of local tick), auto-resolve to cloud
        // If they're close (within 10%), check money as tiebreaker
        if (localTick > 0 && cloudTick > 0) {
          const tickRatio = cloudTick / localTick;

          if (tickRatio < 0.9) {
            // Local is significantly ahead — keep local
            lastSyncAt.current = Date.now();
            setLastSyncAtState(lastSyncAt.current);
            return { success: true, data: cloudState, conflict: 'local' };
          } else if (tickRatio > 1.1) {
            // Cloud is significantly ahead — use cloud
            lastSyncAt.current = Date.now();
            setLastSyncAtState(lastSyncAt.current);
            return { success: true, data: cloudState, conflict: 'cloud' };
          } else {
            // Close — show conflict dialog for user to choose
            setPendingConflict({
              localTick,
              cloudTick,
              localMoney,
              cloudMoney,
            });
            cloudDataRef.current = cloudState;
            lastSyncAt.current = Date.now();
            setLastSyncAtState(lastSyncAt.current);
            return { success: true, data: cloudState };
          }
        }

        // One side has 0 tick (fresh start) — use the non-zero one
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

      return { success: false, error: 'No game state found' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, [user]);

  const resolveConflict = useCallback(async (choice: 'local' | 'cloud'): Promise<{ success: boolean; error?: string }> => {
    setPendingConflict(null);

    if (choice === 'cloud' && cloudDataRef.current) {
      // Cloud chosen — save cloud data to store (this is handled by the caller)
      // Just clear the conflict state
      cloudDataRef.current = null;
      return { success: true };
    }

    // Local chosen — push local state to cloud
    cloudDataRef.current = null;
    return saveToCloud();
  }, [saveToCloud]);

  // Auto-save effect: every 60 seconds, save if logged in and state has changed
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      // Don't auto-save if already syncing
      if (isSyncing.current) return;

      const currentGameTick = useGameStore.getState().gameTick;

      // Only save if the game state has changed since last save
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
  };
}

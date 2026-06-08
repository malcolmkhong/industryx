'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameStore } from '@/lib/game/store';

interface CloudSyncState {
  saveToCloud: () => Promise<{ success: boolean; error?: string }>;
  loadFromCloud: () => Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean }>;
  lastSyncAt: number | null;
  lastAutoSaveAt: number | null;
  isSyncing: boolean;
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
      };

      const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Commander';

      const res = await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, gameState, displayName }),
      });

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

  const loadFromCloud = useCallback(async (): Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      const res = await fetch(`/api/player?userId=${user.id}`);
      const data = await res.json();

      if (data.isNew) {
        return { success: true, isNew: true };
      }

      if (data.data?.game_state) {
        lastSyncAt.current = Date.now();
        setLastSyncAtState(lastSyncAt.current);
        return { success: true, data: data.data.game_state };
      }

      return { success: false, error: 'No game state found' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, [user]);

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
  };
}

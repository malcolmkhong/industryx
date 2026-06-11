'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameStore } from '@/lib/game/store';

export interface CloudBlockState {
  isBlocked: boolean;
  reason: string;
  code: 'ACCOUNT_LOCKED' | 'ACCESS_DENIED' | 'SESSION_EXPIRED' | 'VALIDATION_FAILED' | 'NETWORK_ERROR' | 'MIGRATION_REJECTED';
  detectedAt: number;
}

export interface MigrationResult {
  migrated: boolean;
  action: 'accept' | 'accept_with_flag' | 'reject' | 'reset' | 'use_cloud';
  reason?: string;
  violations?: string[];
  riskLevel?: string;
  checks?: Array<{ name: string; passed: boolean; detail: string }>;
  resetState?: { money: number; totalMoneyEarned: number; gameTick: number; gameSpeed: number };
  stateHash?: string;
  message?: string;
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
  serverStateVersion: number | null;
  isServerAuthoritative: boolean;
  blockedState: CloudBlockState | null;
  migrationResult: MigrationResult | null;
  isMigrating: boolean;
}

// Auto-save interval in milliseconds (increased to 2 minutes to reduce Supabase load)
const AUTO_SAVE_INTERVAL = 120_000;

/**
 * Extract the full game state from the Zustand store for cloud sync.
 */
function extractGameState(): Record<string, unknown> {
  const state = useGameStore.getState();
  return {
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
    productionSnapshot: state.productionSnapshot,
    marketSimState: state.marketSimState,
    sectorTrends: state.sectorTrends,
    marketNews: state.marketNews,
    marketNarratives: state.marketNarratives,
    eventLog: state.eventLog,
    productionHistory: state.productionHistory,
    _version: state._version,
  };
}

/**
 * Cloud sync hook with guest-to-auth migration support.
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
  const isSyncing = useRef(false);
  const lastSyncAt = useRef<number | null>(null);
  const lastAutoSaveAt = useRef<number | null>(null);
  const lastSavedGameTick = useRef<number | null>(null);
  const [lastAutoSaveAtState, setLastAutoSaveAtState] = useState<number | null>(null);
  const [lastSyncAtState, setLastSyncAtState] = useState<number | null>(null);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<CloudSyncState['pendingConflict']>(null);
  const [serverStateHash, setServerStateHash] = useState<string | null>(null);
  const [serverStateVersion, setServerStateVersion] = useState<number | null>(null);
  const [isServerAuthoritative, setIsServerAuthoritative] = useState(false);
  const [blockedState, setBlockedState] = useState<CloudBlockState | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const cloudDataRef = useRef<unknown>(null);
  const initialLoadDone = useRef(false);

  /**
   * Attempt guest-to-auth migration.
   * Called automatically on first sign-in when no cloud state exists.
   */
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
          displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Commander',
        }),
      });

      if (!res.ok && res.status !== 200) {
        return { migrated: false, action: 'reject', reason: `Server error: ${res.status}` };
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
          // The server saved a reset state — apply it locally
          useGameStore.getState().resetGame();
        }
        setIsServerAuthoritative(true);
        setBlockedState({
          isBlocked: true,
          reason: data.reason || 'Guest save data failed validation. Your progress has been reset.',
          code: 'MIGRATION_REJECTED',
          detectedAt: Date.now(),
        });
      } else if (data.action === 'use_cloud') {
        // Cloud state already exists — cloud is authoritative
        setIsServerAuthoritative(true);
        // Load cloud state
        const loadResult = await fetch(`/api/game/state?userId=${user.id}`);
        if (loadResult.ok) {
          const loadData = await loadResult.json();
          if (loadData.data?.fullState) {
            try {
              useGameStore.getState().importSave(JSON.stringify(loadData.data.fullState));
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
  }, [user]);

  const saveToCloud = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };
    if (isSyncing.current) return { success: false, error: 'Already syncing' };

    isSyncing.current = true;
    setIsSyncingState(true);
    try {
      const gameState = extractGameState();

      // Try the authoritative server_game_state endpoint first
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

      if (res.status === 400) {
        const data = await res.json();
        if (data.code === 'VALIDATION_FAILED') {
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
        lastSavedGameTick.current = useGameStore.getState().gameTick;
        setLastSyncAtState(lastSyncAt.current);
        if (data.stateHash) {
          setServerStateHash(data.stateHash);
        }
        if (data.stateVersion) {
          setServerStateVersion(data.stateVersion);
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
          lastSavedGameTick.current = useGameStore.getState().gameTick;
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
        if (data.data.stateVersion) {
          setServerStateVersion(data.data.stateVersion);
        }
        setIsServerAuthoritative(true);

        // ── After first migration: CLOUD ALWAYS WINS ──
        // No more "keep local?" dialogs. Cloud is authoritative.
        if (cloudTick > 0) {
          // Cloud has state — it's authoritative
          lastSyncAt.current = Date.now();
          setLastSyncAtState(lastSyncAt.current);
          return { success: true, data: cloudState, conflict: 'cloud' };
        }

        // Edge case: cloud tick is 0 but has state (shouldn't happen, but handle gracefully)
        lastSyncAt.current = Date.now();
        setLastSyncAtState(lastSyncAt.current);
        return { success: true, data: cloudState, conflict: localTick > 0 ? 'cloud' : undefined };
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
          const cloudTick = (cloudState.gameTick as number) || 0;

          setIsServerAuthoritative(true);

          // Cloud always wins
          lastSyncAt.current = Date.now();
          setLastSyncAtState(lastSyncAt.current);
          return { success: true, data: cloudState, conflict: cloudTick > 0 ? 'cloud' : undefined };
        }
      }

      return { success: false, error: 'No game state found' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, [user]);

  const resolveConflict = useCallback(async (choice: 'local' | 'cloud'): Promise<{ success: boolean; error?: string }> => {
    setPendingConflict(null);

    // After migration: cloud always wins. This function is kept for backwards compat
    // but should rarely be called anymore.
    if (choice === 'cloud' && cloudDataRef.current) {
      // Apply cloud state locally
      try {
        useGameStore.getState().importSave(JSON.stringify(cloudDataRef.current));
      } catch {
        // If import fails, keep current state
      }
      cloudDataRef.current = null;
      return { success: true };
    }

    // If somehow "local" is chosen after migration, still save to cloud
    // (cloud is authoritative, so we push local → cloud)
    cloudDataRef.current = null;
    return saveToCloud();
  }, [saveToCloud]);

  // Auto-load/migrate on login (first load only)
  useEffect(() => {
    if (!user || initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      // First, check if user already has cloud state
      const loadResult = await loadFromCloud();

      if (loadResult.isNew) {
        // ── FIRST-TIME LOGIN: No cloud state exists ──
        // This is a guest migrating to an authenticated account.
        // Validate their local state and migrate it.
        const migration = await migrateGuestToCloud();

        if (migration.migrated) {
          // Migration succeeded — local state is now cloud state
          // No need to import anything, local state is already correct
        } else if (migration.action === 'reset') {
          // Migration rejected — local state was reset
          // The user will see the reset state
        }
        // If migration failed for other reasons, local state continues
      } else if (loadResult.success && loadResult.data && loadResult.conflict === 'cloud') {
        // ── RETURNING USER: Cloud state exists and is authoritative ──
        // Apply cloud state locally (cloud always wins)
        try {
          useGameStore.getState().importSave(JSON.stringify(loadResult.data));
        } catch {
          // If import fails, the local state stays
        }
      }
    })();
  }, [user, loadFromCloud, migrateGuestToCloud]);

  // Auto-save effect: every 2 minutes, save if logged in and state has changed
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      if (isSyncing.current || isMigrating) return;

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

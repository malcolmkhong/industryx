// ============================================
// Cloud Sync — Shared Types
// ============================================
//
// Types and interfaces shared across the cloudSync/ module. These are
// the same types that were previously defined inline in useCloudSync.ts.
// The public CloudSyncState return type MUST remain stable — all
// existing consumers depend on this shape.
// ============================================

export interface CloudBlockState {
  isBlocked: boolean;
  reason: string;
  code:
    | 'ACCOUNT_LOCKED'
    | 'ACCESS_DENIED'
    | 'SESSION_EXPIRED'
    | 'VALIDATION_FAILED'
    | 'NETWORK_ERROR'
    | 'MIGRATION_REJECTED';
  detectedAt: number;
}

export interface CloudSyncState {
  saveToCloud: () => Promise<{ success: boolean; error?: string }>;
  loadFromCloud: () => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    isNew?: boolean;
    conflict?: 'local' | 'cloud';
  }>;
  lastSyncAt: number | null;
  lastAutoSaveAt: number | null;
  isSyncing: boolean;
  resolveConflict: (
    choice: 'local' | 'cloud'
  ) => Promise<{ success: boolean; error?: string }>;
  pendingConflict: {
    localTick: number;
    cloudTick: number;
    localMoney: number;
    cloudMoney: number;
  } | null;
  serverStateHash: string | null;
  serverStateVersion: number | null;
  isServerAuthoritative: boolean;
  blockedState: CloudBlockState | null;
}

// ── Server authority tracking ──────────────────────────
export interface ServerAuthority {
  serverStateHash: string | null;
  serverStateVersion: number | null;
  isServerAuthoritative: boolean;
}

// Service-level state shape (data only — hook adds functions in CloudSyncState).
// Kept separate so the service's getState() returns a stable data snapshot,
// while the hook's CloudSyncState augments it with bound actions.
export interface CloudSyncServiceState {
  blockedState: CloudBlockState | null;
  isSyncing: boolean;
  lastSyncAt: number | null;
  lastAutoSaveAt: number | null;
  serverStateHash: string | null;
  serverStateVersion: number | null;
  isServerAuthoritative: boolean;
}

// ── Operation results ─────────────────────────────────
export interface SyncResult {
  success: boolean;
  error?: string;
}

export interface LoadResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  isNew?: boolean;
  conflict?: 'local' | 'cloud';
}

// ── Conflict detection ────────────────────────────────
export interface ConflictInfo {
  localTick: number;
  localMoney: number;
  cloudTick: number;
  cloudMoney: number;
}

// Auto-save interval in milliseconds (2 minutes, reduces Supabase load)
export const AUTO_SAVE_INTERVAL = 120_000;

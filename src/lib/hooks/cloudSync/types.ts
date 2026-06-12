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
  migrationResult: MigrationResult | null;
  isMigrating: boolean;
}

// Auto-save interval in milliseconds (2 minutes, reduces Supabase load)
export const AUTO_SAVE_INTERVAL = 120_000;

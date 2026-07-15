/**
 * CloudSyncService — Phase 5.
 *
 * Owns cloud sync state and operations independently of React. The orchestrator
 * drives load/save timing. The useCloudSync hook facade reads from this service
 * and exposes the legacy CloudSyncState shape to consumers.
 *
 * Per Q5: the isNew branch and migrate-guest auto-call are removed. Cloud
 * load always treats the server as authoritative. migrate-guest remains
 * callable as a legacy fallback (not invoked from normal startup).
 *
 * State lives outside React so the orchestrator (a plain class) can mutate it
 * directly via subscriptions.
 */

import type {
  CloudBlockState,
  CloudSyncServiceState,
  ServerAuthority,
  SyncResult,
  LoadResult,
} from "./types";

// Phase 5.5: 60s (was 120s) — halve the data-loss window on browser close.
// Still bandwith-cheap (1 save per player per minute), still per-player
// deduplicated by `lastSavedGameTick` check.
const AUTO_SAVE_INTERVAL = 60_000;

type Listener = () => void;
type BlockListener = (blocked: CloudBlockState | null) => void;

export class CloudSyncService {
  private userId: string | null = null;
  private isServerAuthoritative = false;
  private serverStateHash: string | null = null;
  private serverStateVersion: number | null = null;
  private blockedState: CloudBlockState | null = null;
  private isSyncing = false;
  private lastSyncAt: number | null = null;
  private lastAutoSaveAt: number | null = null;
  private lastSavedGameTick: number | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private blockListeners = new Set<BlockListener>();

  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  getServerAuthority(): ServerAuthority {
    return {
      serverStateHash: this.serverStateHash,
      serverStateVersion: this.serverStateVersion,
      isServerAuthoritative: this.isServerAuthoritative,
    };
  }

  getBlockedState(): CloudBlockState | null {
    return this.blockedState;
  }

  private cachedSnapshot: CloudSyncServiceState | null = null;

  getState(): CloudSyncServiceState {
    // Cache the snapshot reference. useSyncExternalStore relies on Object.is
    // equality; a fresh object literal each call would trigger infinite renders.
    if (this.cachedSnapshot === null) {
      this.cachedSnapshot = {
        blockedState: this.blockedState,
        isSyncing: this.isSyncing,
        lastSyncAt: this.lastSyncAt,
        lastAutoSaveAt: this.lastAutoSaveAt,
        serverStateHash: this.serverStateHash,
        serverStateVersion: this.serverStateVersion,
        isServerAuthoritative: this.isServerAuthoritative,
      };
    }
    return this.cachedSnapshot;
  }

  private invalidateSnapshot(): void {
    this.cachedSnapshot = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onBlockedChange(listener: BlockListener): () => void {
    this.blockListeners.add(listener);
    return () => {
      this.blockListeners.delete(listener);
    };
  }

  private notify(): void {
    this.invalidateSnapshot();
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.warn("[CloudSyncService] listener threw:", err);
      }
    }
  }

  private setBlocked(blocked: CloudBlockState | null): void {
    this.blockedState = blocked;
    for (const l of this.blockListeners) {
      try {
        l(blocked);
      } catch (err) {
        console.warn("[CloudSyncService] block listener threw:", err);
      }
    }
    this.notify();
  }

  clearBlocked(): void {
    this.setBlocked(null);
  }

  private setServerAuthority(auth: ServerAuthority): void {
    this.serverStateHash = auth.serverStateHash;
    this.serverStateVersion = auth.serverStateVersion;
    this.isServerAuthoritative = auth.isServerAuthoritative;
    this.notify();
  }

  /**
   * Load cloud state. Called by orchestrator on READY state (anon or auth).
   * Per Q5: server_game_state already exists for anon (initialize-guest
   * creates it). For auth: server is authoritative, applies cloud state.
   * Returns load result for orchestrator to apply to game store.
   */
  async load(): Promise<LoadResult> {
    if (!this.userId) return { success: false, error: "Not authenticated" };
    try {
      const res = await fetch(`/api/game/state/sync?userId=${this.userId}`);
      if (res.status >= 400) {
        const body = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const mapping = mapLoadErrorToBlock(res.status, body);
        if (mapping) {
          this.setBlocked(mapping.blocked);
          return { success: false, error: mapping.userMessage };
        }
        return { success: false, error: `Server error: ${res.status}` };
      }
      const data = await res.json();
      if (data.isNew) {
        this.setBlocked({
          isBlocked: true,
          reason: "Server did not return initialized game state.",
          code: "SERVER_UNAVAILABLE",
          detectedAt: Date.now(),
        });
        return {
          success: false,
          error: "Server did not return initialized game state",
        };
      }
      if (data.data?.fullState) {
        const cloudState = data.data.fullState as Record<string, unknown>;
        this.setServerAuthority({
          serverStateHash:
            (data.data.stateHash as string | undefined) ?? this.serverStateHash,
          serverStateVersion:
            (data.data.stateVersion as number | undefined) ??
            this.serverStateVersion,
          isServerAuthoritative: true,
        });
        // Mark the cloud load as a sync point. Consumers such as
        // useOfflineProgressCheck wait for this before asking the server
        // to settle elapsed ticks.
        this.lastSyncAt = Date.now();
        this.notify();
        return { success: true, data: cloudState, conflict: "cloud" };
      }
      return { success: false, error: "No game state found" };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  /**
   * Save cloud state. Called by orchestrator on auto-save tick + manual triggers.
   */
  async save(
    getGameTick: () => number,
    getGameState: () => unknown,
  ): Promise<SyncResult> {
    if (!this.userId) return { success: false, error: "Not authenticated" };
    if (this.isSyncing) return { success: false, error: "Already syncing" };
    this.isSyncing = true;
    this.notify();
    try {
      const res = await fetch("/api/game/state/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: this.userId,
          gameState: getGameState(),
          clientChecksum: this.serverStateHash || undefined,
          clientStateVersion: this.serverStateVersion ?? undefined,
        }),
      });
      if (res.status === 409) {
        const conflictData = await res.json();
        if (conflictData.code === "STATE_VERSION_CONFLICT") {
          const serverState = conflictData.serverState as
            | {
                fullState?: Record<string, unknown>;
                stateVersion?: number;
                stateHash?: string;
              }
            | undefined;
          if (serverState?.fullState) {
            // Server is authoritative. Hydrate the client immediately from the
            // server-provided state so the next save attempt doesn't re-send the
            // same stale tick (which would re-trigger Game-tick-went-backwards
            // and accumulate cheat flags). This was a missing piece that caused
            // guest accounts to auto-lock from infinite stale-save retries.
            const { applyServerState } = await import("@/lib/game/state/store");
            applyServerState(serverState.fullState);
          }
          this.setServerAuthority({
            serverStateHash: serverState?.stateHash ?? this.serverStateHash,
            serverStateVersion:
              serverState?.stateVersion ?? this.serverStateVersion,
            isServerAuthoritative: true,
          });
          this.setBlocked({
            isBlocked: true,
            reason:
              "Your local state was behind the server. Synced to server version.",
            code: "MIGRATION_REJECTED",
            detectedAt: Date.now(),
          });
          return {
            success: false,
            error: "Server state was newer — synced to server version",
          };
        }
      }
      if (res.status >= 400) {
        const body = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const mapping = mapSaveErrorToBlock(res.status, body);
        if (mapping) {
          this.setBlocked(mapping.blocked);
          return { success: false, error: mapping.userMessage };
        }
        return { success: false, error: `Server error: ${res.status}` };
      }
      const data = await res.json();
      const validation = data.validation as
        | {
            isValid?: boolean;
            riskLevel?: "low" | "medium" | "high" | "critical";
            violations?: string[];
          }
        | undefined;
      if (
        data.saved &&
        validation &&
        validation.riskLevel &&
        validation.riskLevel !== "low"
      ) {
        const violationList = Array.isArray(validation.violations)
          ? validation.violations
          : [];
        const summary =
          violationList.length > 0
            ? violationList.join("; ")
            : "No details provided";
        if (validation.riskLevel === "critical") {
          this.setBlocked({
            isBlocked: true,
            reason: `Server validation critical: ${summary}`,
            code: "VALIDATION_FAILED",
            detectedAt: Date.now(),
          });
        }
      }
      if (data.saved) {
        this.setServerAuthority({
          serverStateHash:
            (data.stateHash as string | undefined) ?? this.serverStateHash,
          serverStateVersion:
            (data.stateVersion as number | undefined) ??
            this.serverStateVersion,
          isServerAuthoritative: true,
        });
        this.setBlocked(null);
        this.lastSyncAt = Date.now();
        this.lastAutoSaveAt = Date.now();
        this.lastSavedGameTick = getGameTick();
        this.notify();
        return { success: true };
      }
      return {
        success: false,
        error: (data.error as string | undefined) || "Save failed",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  /**
   * Start the auto-save tick. Called by orchestrator when authenticated.
   */
  startAutoSave(
    getGameTick: () => number,
    getGameState: () => unknown,
    onAfterSave?: (tick: number) => void,
  ): void {
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(() => {
      if (this.isSyncing || !this.userId) return;
      const currentGameTick = getGameTick();
      if (
        this.lastSavedGameTick !== null &&
        this.lastSavedGameTick === currentGameTick
      )
        return;
      void this.save(getGameTick, getGameState).then((result) => {
        if (result.success) onAfterSave?.(currentGameTick);
      });
    }, AUTO_SAVE_INTERVAL);
  }

  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Phase 5.5: best-effort save triggered on tab close / visibility change.
   *
   * The `isSyncing` guard means concurrent saves (auto-save + manual + unload)
   * cannot collide — at most one in-flight POST at a time. If a save is
   * already running when the unload fires, we return early (the in-flight
   * request will complete or fail on its own).
   *
   * Note: `beforeunload` and `visibilitychange` are synchronous events;
   * the underlying fetch is fire-and-forget. The browser may kill the
   * page before the request completes, in which case the server may or
   * may not receive the save. This is acceptable for an idle game — worst
   * case is the player loses up to 60s of progress (the auto-save window).
   */
  flushSaveOnUnload(
    getGameTick: () => number,
    getGameState: () => unknown,
  ): void {
    if (!this.userId) return;
    if (this.isSyncing) return; // already in flight, don't double up
    const currentGameTick = getGameTick();
    if (
      this.lastSavedGameTick !== null &&
      this.lastSavedGameTick === currentGameTick
    ) {
      return; // nothing new since last save
    }
    // Fire-and-forget. We don't await — caller is a sync event handler.
    void this.save(getGameTick, getGameState);
  }
}

function mapLoadErrorToBlock(
  status: number,
  body: Record<string, unknown>,
): { blocked: CloudBlockState; userMessage: string } | null {
  if (status === 401 || status === 403) {
    const code =
      (body.code as string) === "ACCOUNT_LOCKED"
        ? "ACCOUNT_LOCKED"
        : "ACCESS_DENIED";
    return {
      blocked: {
        isBlocked: true,
        reason: (body.message as string) || "Access denied",
        code,
        detectedAt: Date.now(),
      },
      userMessage: (body.message as string) || "Access denied",
    };
  }
  return null;
}

function mapSaveErrorToBlock(
  status: number,
  body: Record<string, unknown>,
): { blocked: CloudBlockState; userMessage: string } | null {
  if (status === 401) {
    return {
      blocked: {
        isBlocked: true,
        reason: "Session expired. Please sign in again.",
        code: "SESSION_EXPIRED",
        detectedAt: Date.now(),
      },
      userMessage: "Session expired",
    };
  }
  if (status === 403) {
    const code =
      (body.code as string) === "ACCOUNT_LOCKED"
        ? "ACCOUNT_LOCKED"
        : "ACCESS_DENIED";
    return {
      blocked: {
        isBlocked: true,
        reason: (body.message as string) || "Access denied",
        code,
        detectedAt: Date.now(),
      },
      userMessage: (body.message as string) || "Access denied",
    };
  }
  return null;
}

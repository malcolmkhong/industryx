import { useEffect, useRef, useState } from "react";
import { useGameStore, applyServerState } from "@/lib/game/state/store";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCloudSync } from "@/lib/hooks/useCloudSync";

export interface OfflineProgressData {
  resources: Record<string, number>;
  money: number;
  ticksElapsed: number;
}

// On mount (after auth + cloud hydration), checks whether the player
// accumulated offline progress on the server. Server is authoritative:
// runs the same `runServerTicks()` engine used by server elapsed-tick
// settlement, persists the post-tick state, and returns the authoritative
// delta. The hook opens the dialog with that delta — no client-side
// calculation, no two-engine drift.
//
// Single flow for all signed-in profiles:
//   - Supabase authenticated user (OAuth / Google / GitHub)
//   - Anonymous guest (created by /api/auth/guest/quickstart on first visit)
//
// Idempotency: server's 60s floor and `last_tick_at` update on apply
// guarantee a second call within the same absence window returns 0
// ticks. `hasCheckedOffline` ref also blocks double-fires per session.
export function useOfflineProgressCheck(): {
  offlineData: OfflineProgressData | null;
  setOfflineData: React.Dispatch<React.SetStateAction<OfflineProgressData | null>>;
  offlineDialogOpen: boolean;
  setOfflineDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [offlineData, setOfflineData] = useState<OfflineProgressData | null>(null);
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false);
  const { user } = useAuth();
  const { lastSyncAt } = useCloudSync();
  const hasCheckedOffline = useRef(false);

  useEffect(() => {
    if (hasCheckedOffline.current) return undefined;
    // Only signed-out users skip entirely; both anon and OAuth users
    // have a Supabase session that the server route accepts.
    if (!user) return undefined;
    // Wait for cloud hydration before triggering so the hook sees the
    // most recent saved state in the store (for computing the dialog
    // delta). `lastSyncAt` is bumped on both save AND successful load
    // (CloudSyncService.load path).
    if (!lastSyncAt) return undefined;

    hasCheckedOffline.current = true;
    let aborted = false;

    (async () => {
      try {
        // Snapshot pre-tick state so we can compute deltas for the dialog
        // before applying the server response.
        const beforeState = useGameStore.getState();
        const beforeMoney = Number(beforeState.money) || 0;
        const beforeResources: Record<string, number> = {
          ...(beforeState.resources as Record<string, number>),
        };

        const r = await fetch("/api/game/state/offline-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          credentials: "same-origin",
        });
        if (aborted || !r.ok) return;
        const result = (await r.json()) as {
          newState?: { money?: number; resources?: Record<string, number> };
          ticksApplied?: number;
          elapsedSeconds?: number;
        };

        // Server returns 0 ticks for sub-60s absences (the floor we added)
        // or for new users with no prior state. Don't show a dialog.
        if (!result || !result.newState || !(result.ticksApplied && result.ticksApplied > 0)) {
          return;
        }

        const newState = result.newState;
        const newMoney = Number(newState.money) || 0;
        const moneyEarned = Math.max(0, newMoney - beforeMoney);
        const resourcesEarned: Record<string, number> = {};
        const newResources = newState.resources ?? {};
        for (const k of Object.keys(beforeResources)) {
          const before = beforeResources[k] ?? 0;
          const after = Number(newResources[k]) || 0;
          const earned = after - before;
          if (earned > 0.01) resourcesEarned[k] = earned;
        }

        // Apply server-authoritative state. Subsequent collect just closes
        // the dialog; the state is already current.
        try {
          applyServerState(newState as Record<string, unknown>);
        } catch (err) {
          console.warn("[useOfflineProgressCheck] applyServerState failed:", err);
          return;
        }

        const hasResourceGain = Object.values(resourcesEarned).some(
          (v) => v > 0,
        );
        if (moneyEarned > 0 || hasResourceGain) {
          setOfflineData({
            resources: resourcesEarned,
            money: moneyEarned,
            ticksElapsed: result.elapsedSeconds ?? result.ticksApplied ?? 0,
          });
          setOfflineDialogOpen(true);
        }
      } catch (err) {
        console.warn("[useOfflineProgressCheck] server offline POST failed:", err);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [user, lastSyncAt]);

  return { offlineData, setOfflineData, offlineDialogOpen, setOfflineDialogOpen };
}

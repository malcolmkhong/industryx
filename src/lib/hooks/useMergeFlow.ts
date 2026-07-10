// Phase 6: Merge flow hook — passive facade.
//
// All merge logic lives in MergeFlowService. The orchestrator triggers
// startMergeCheck() on anon→auth transition. This hook only exposes
// the service state + actions to React consumers (LoginFloatingPanel).
//
// Behavior change:
//   - triggeredRef bug removed. Same-account re-login still triggers
//     merge check, but link-identity is idempotent server-side.
//   - Per Q3: merge UI auto-opens on conflict (handled by service).

"use client";

import {
  useContext,
  createContext,
  useEffect,
  useSyncExternalStore,
} from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import type {
  MergeFlowService,
} from "./merge/MergeFlowService";

const MergeCtx = createContext<{ service: MergeFlowService } | null>(null);

export const MergeFlowServiceProvider = MergeCtx.Provider;

export function useMergeFlow() {
  const ctx = useContext(MergeCtx);
  if (!ctx) {
    throw new Error(
      "useMergeFlow must be used within MergeFlowServiceProvider",
    );
  }
  const { service } = ctx;
  const { user, deviceId } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    service.setContext(userId, deviceId);
  }, [service, userId, deviceId]);

  const state = useSyncExternalStore(
    (cb) => service.subscribe(cb),
    () => service.getState(),
    () => service.getState(),
  );

  return {
    state,
    triggerMergeCheck: () => service.startMergeCheck(),
    confirmMerge: () => service.confirmMerge(),
    cancelMerge: () => service.cancelMerge(),
    closeMerge: () => service.closeMerge(),
    retryMerge: () => service.retryMerge(),
  };
}

export type { MergeState, MergePreference } from "./merge/MergeFlowService";
export { MergeFlowService } from "./merge/MergeFlowService";

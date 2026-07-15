// Parse the JSON body of a server action response and apply the
// server-authoritative correctedState to the local store. Centralizes
// the response shape and the applyServerState side-effect.

"use client";

import { applyServerState } from "../../state/store";
import type { ServerGameData } from "@/lib/game/shared/types/types";

export interface ParsedActionResponse {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
}

/**
 * Parse the server action response. If `correctedState` is present, apply
 * it to the local Zustand store via `applyServerState` so the UI reflects
 * exactly what the server persisted. Returns the correctedState to callers
 * so they can choose how to apply it to their own state.
 */
export function parseActionResponse(data: {
  valid: boolean;
  error?: string;
  correctedState?: unknown;
}): ParsedActionResponse {
  if (!data.valid) {
    return { valid: false, error: data.error || "Action rejected by server" };
  }

  // Server may return a server-authoritative post-action `correctedState`.
  // Surface it to callers so they can apply exactly what the server
  // persisted, instead of computing cost/deductions locally.
  const serverCorrected =
    typeof data.correctedState === "object" && data.correctedState !== null
      ? (data.correctedState as Record<string, unknown>)
      : undefined;
  if (serverCorrected) {
    applyServerState(serverCorrected);
  }
  // Phase 13: correctedState is strictly Partial<ServerGameData>.
  // The server returns server-authoritative data only — no UI fields.
  return {
    valid: true,
    correctedState: serverCorrected as Partial<ServerGameData> | undefined,
  };
}

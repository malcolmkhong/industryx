// Build the POST body for server action requests. Centralizes the
// client-state projection that the server validates against.

"use client";

import { useGameStore } from "../../state/store";
import { getCurrentDeviceId } from "./validationState";

export interface ActionRequestBody {
  userId: string;
  deviceId?: string | null;
  actionType: string;
  payload: Record<string, unknown>;
  requestId?: string;
  gameState: {
    money: number;
    totalMoneyEarned: number;
    gameTick: number;
    buildings: unknown;
    resources: unknown;
    researchPoints: number;
    completedResearch: string[];
    workers: unknown;
    gameSpeed: number;
  };
}

/**
 * Build the request body for a server action call. Pulls only the
 * server-relevant fields from the Zustand store so the server can
 * validate against an authoritative projection, not the full client
 * state.
 */
export function buildActionRequestBody(
  userId: string,
  actionType: string,
  payload: Record<string, unknown>,
  requestId?: string,
): ActionRequestBody {
  const state = useGameStore.getState();
  return {
    userId,
    deviceId: getCurrentDeviceId(),
    actionType,
    payload,
    requestId, // Phase 2.3: forward nonce for server replay detection
    gameState: {
      money: state.money,
      totalMoneyEarned: state.totalMoneyEarned,
      gameTick: state.gameTick,
      buildings: state.buildings,
      resources: state.resources,
      researchPoints: state.researchPoints,
      completedResearch: state.completedResearch,
      workers: state.workers,
      gameSpeed: state.gameSpeed,
    },
  };
}

import {
  validateBuyAction,
  validateSellAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleSellAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const amount = payload.amount as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: "Invalid amount in payload" };
  }

  return validateSellAction(resource, amount, gameState);
}

export function handleBuyAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const amount = payload.amount as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: "Invalid amount in payload" };
  }

  return validateBuyAction(resource, amount, gameState);
}
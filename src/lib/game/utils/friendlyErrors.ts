// ============================================
// friendlyErrors.ts
//
// Maps server-side technical error messages to user-facing friendly
// messages. The server's `result.error` field often contains technical
// details (NaN values, multiplier numbers, internal state references)
// that are useful for operators but confusing/leaky for users.
//
// This file is the ONLY translation point. The raw server error is
// still preserved in the response body for debugging; only the UI
// notification uses the friendly version.
//
// Pattern for adding new mappings:
// 1. Identify the technical error prefix from serverEngine.ts
// 2. Add a case that matches the prefix and returns a friendly message
// 3. Fall through to the generic case
//
// SECURITY: Never leak server-side state (numbers, IDs, internal field
// names) into the user-facing message.
// ============================================

/**
 * Map server technical error to user-facing friendly message.
 * Returns a generic message for unknown errors (no leak).
 */
export function friendlyActionError(serverError: string | undefined): string {
  if (!serverError) {
    return "Action could not be completed. Please try again.";
  }

  // Sell / Buy action errors
  if (serverError.includes("Not enough")) {
    return serverError; // e.g., "Not enough iron to sell" — already user-friendly
  }
  if (serverError.includes("No market found")) {
    return "This resource is not currently tradeable. Try a different resource.";
  }
  if (serverError.includes("Market price for") && serverError.includes("is invalid")) {
    return "Market temporarily unavailable. Please try again in a moment.";
  }
  if (serverError.includes("Computed sell price is non-finite")) {
    return "Trade could not be completed right now. Please try again.";
  }
  if (serverError.includes("Computed buy cost is non-finite")) {
    return "Trade could not be completed right now. Please try again.";
  }
  if (serverError.includes("Storage full")) {
    return "Storage is full. Sell or store resources before buying more.";
  }

  // Worker / hire errors
  if (serverError.includes("Unknown worker type")) {
    return "That worker type is not available.";
  }
  if (serverError.includes("Worker \"") && serverError.includes("not found")) {
    return "Worker no longer exists. Please refresh and try again.";
  }

  // Quest / contract errors
  if (serverError.includes("Quest") && serverError.includes("not found")) {
    return "That quest is no longer available.";
  }
  if (serverError.includes("already completed") && serverError.includes("reward")) {
    return "Reward already claimed.";
  }
  if (serverError.includes("not yet completed")) {
    return "Quest requirements not yet met.";
  }
  if (serverError.includes("Contract") && serverError.includes("not found")) {
    return "Contract no longer exists.";
  }
  if (serverError.includes("already completed") && serverError.toLowerCase().includes("contract")) {
    return "Contract already fulfilled.";
  }
  if (serverError.includes("already failed") && serverError.toLowerCase().includes("contract")) {
    return "Contract has expired.";
  }

  // Building / storage errors
  if (serverError.includes("Building instance") && serverError.includes("not found")) {
    return "Building no longer exists. Please refresh.";
  }
  if (serverError.includes("Building type") && serverError.includes("not found")) {
    return "That building is not available yet.";
  }

  // Generic catches
  if (serverError.includes("Invalid") || serverError.includes("missing")) {
    return "Invalid request. Please refresh and try again.";
  }
  if (serverError.includes("too many") || serverError.includes("cap")) {
    return "Limit reached. Finish or cancel existing actions first.";
  }

  // Unknown error — generic fallback. NEVER echo the raw server error
  // because it may leak internal state (numbers, IDs, formulas).
  return "Action could not be completed. Please try again.";
}

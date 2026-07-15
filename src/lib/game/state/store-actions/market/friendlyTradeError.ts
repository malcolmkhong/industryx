// Inline: translate server technical error → user-friendly text.
// The raw error is still logged to console for debugging; this only
// affects the user-facing notification. Keeps translation local to the
// file rather than in a shared helper — same pattern as other action files.
export function friendlyTradeError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("Not enough")) return e; // e.g., "Not enough iron to sell" — already friendly
  if (e.includes("No market found"))
    return "This resource is not currently tradeable. Try a different resource.";
  if (e.includes("Market price for") && e.includes("is invalid"))
    return "Market temporarily unavailable. Please try again in a moment.";
  if (e.includes("Computed sell price is non-finite"))
    return "Trade could not be completed right now. Please try again.";
  if (e.includes("Computed buy cost is non-finite"))
    return "Trade could not be completed right now. Please try again.";
  if (e.includes("Storage full"))
    return "Storage is full. Sell or store resources before buying more.";
  return e || "Trade could not be completed. Please try again.";
}

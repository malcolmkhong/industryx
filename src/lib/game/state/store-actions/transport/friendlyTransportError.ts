// Inline: translate server technical error → user-friendly text.
export function friendlyTransportError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("Transport type") && e.includes("not found in config"))
    return "That transport type is not available.";
  if (e.includes("Source building") && e.includes("not found"))
    return "Source building no longer exists.";
  if (e.includes("Destination building") && e.includes("not found"))
    return "Destination building no longer exists.";
  if (e.includes("Transport line") && e.includes("not found"))
    return "Transport line no longer exists.";
  if (e.includes("Not enough money for transport"))
    return "Not enough money to build transport.";
  if (e.includes("Not enough money to upgrade"))
    return "Not enough money to upgrade transport.";
  return e || "Transport action could not be completed. Please try again.";
}

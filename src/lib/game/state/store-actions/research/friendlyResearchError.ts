// Inline: translate server technical error → user-friendly text.
export function friendlyResearchError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("not found in game config"))
    return "That research is not available yet.";
  if (e.includes("Prerequisite research") && e.includes("not completed"))
    return "Prerequisite research not completed.";
  if (e.includes("already completed")) return "Already researched.";
  if (e.includes("already in progress")) return "Research already in progress.";
  if (e.includes("Not enough research points"))
    return "Not enough research points.";
  return e || "Research could not be started. Please try again.";
}
// friendlyPrestigeError: pure error translator. Server technical error
// → user-facing text. No imports needed.

export function friendlyPrestigeError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("at least 5 buildings"))
    return "Need at least 5 buildings to Global Expand!";
  return e || "Prestige could not be performed. Please try again.";
}

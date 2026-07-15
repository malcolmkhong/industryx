// Inline: translate server technical error → user-friendly text.
export function friendlyDroneError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("not found in fleet"))
    return "Drone not found. Please refresh.";
  if (e.includes("not idle")) return "Drone is busy with another mission.";
  if (e.includes("Invalid missionId format"))
    return "That mission is not available.";
  if (e.includes("Not enough money for drone fuel"))
    return "Not enough money for drone fuel.";
  return e || "Drone mission could not be started. Please try again.";
}

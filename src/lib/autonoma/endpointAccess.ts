export interface AutonomaEndpointEnvironment {
  AUTONOMA_PREVIEWKIT?: string;
  AUTONOMA_SHARED_SECRET?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
}

export function isAutonomaEndpointEnabled(
  environment: AutonomaEndpointEnvironment = process.env,
): boolean {
  if (environment.AUTONOMA_PREVIEWKIT) return true;

  if (
    environment.VERCEL_ENV === "preview" &&
    environment.AUTONOMA_SHARED_SECRET
  ) {
    return true;
  }

  return environment.NODE_ENV !== "production";
}

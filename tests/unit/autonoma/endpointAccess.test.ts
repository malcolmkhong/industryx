import { describe, expect, it } from "vitest";

import { isAutonomaEndpointEnabled } from "@/lib/autonoma/endpointAccess";

describe("isAutonomaEndpointEnabled", () => {
  it("allows an Autonoma-managed preview", () => {
    expect(
      isAutonomaEndpointEnabled({
        NODE_ENV: "production",
        AUTONOMA_PREVIEWKIT: "1",
      }),
    ).toBe(true);
  });

  it("keeps Vercel Production disabled", () => {
    expect(
      isAutonomaEndpointEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        AUTONOMA_SHARED_SECRET: "injected-secret",
      }),
    ).toBe(false);
  });

  it("allows the Autonoma-injected secret on a Vercel Preview", () => {
    expect(
      isAutonomaEndpointEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        AUTONOMA_SHARED_SECRET: "injected-secret",
      }),
    ).toBe(true);
  });

  it("keeps an unsigned Vercel Preview disabled", () => {
    expect(
      isAutonomaEndpointEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe(false);
  });
});

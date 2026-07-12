import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSyncService } from "@/lib/hooks/cloudSync/CloudSyncService";

describe("CloudSyncService.load", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not silently accept an isNew load response without initialized state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      json: async () => ({ isNew: true, data: null }),
    } as Response);

    const service = new CloudSyncService();
    service.setUserId("user-1");

    const result = await service.load();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/initialized game state/);
    expect(service.getBlockedState()?.code).toBe("SERVER_UNAVAILABLE");
  });
});

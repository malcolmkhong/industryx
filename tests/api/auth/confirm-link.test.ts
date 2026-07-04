/**
 * tests/api/auth/confirm-link.test.ts
 *
 * Boundary + auth tests for POST /api/auth/confirm-link.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRequest, readJson } from "../helpers/request";
import { mockSupabaseServer } from "../../unit/mocks/supabase";

vi.mock("@/lib/supabase/server", () => mockSupabaseServer());
vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    action: { limit: 100, windowMs: 60000 },
    general: { limit: 200, windowMs: 60000 },
  },
}));
vi.mock("@/lib/auth/verifyAuth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({
    success: true,
    userId: "user-1",
    email: "test@example.com",
  }),
}));

import { POST } from "@/app/api/auth/confirm-link/route";

describe("POST /api/auth/confirm-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when operationId is missing", async () => {
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/confirm-link",
      body: { idempotencyKey: "key-1", preference: "keep_guest" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/operationId/);
  });

  it("returns 400 when idempotencyKey is missing", async () => {
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/confirm-link",
      body: { operationId: "op-1", preference: "keep_guest" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/idempotencyKey/);
  });

  // Phase 2 (auth_wins_only): preference is now OPTIONAL.
  // These tests verify that the missing preference no longer fails the request
  // with a preference-validation 400 — instead the route proceeds until the
  // operation lookup succeeds or fails (here, returns 404/400 from invalid op,
  // not from preference validation).
  it("does NOT fail on preference validation when preference is missing", async () => {
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/confirm-link",
      body: { operationId: "op-1", idempotencyKey: "key-1" },
    });
    const res = await POST(req);
    const body = await readJson<{ error?: string }>(res);
    // Old behavior: 400 "Invalid preference. Must be keep_guest or keep_google"
    // New behavior: passes preference check, fails at op lookup with 404 "Operation not found"
    expect(body.error).not.toMatch(/Invalid preference/i);
  });

  it("does NOT fail on preference validation when preference is junk", async () => {
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/confirm-link",
      body: {
        operationId: "op-1",
        idempotencyKey: "key-1",
        preference: "garbage_value",
      },
    });
    const res = await POST(req);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).not.toMatch(/Invalid preference/i);
  });

  it("returns 401 when not authenticated", async () => {
    const { verifyAuth } = await import("@/lib/auth/verifyAuth");
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: { status: 401 } as unknown as Response,
    });
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/confirm-link",
      body: {
        operationId: "op-1",
        idempotencyKey: "key-1",
        preference: "keep_guest",
      },
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });
});

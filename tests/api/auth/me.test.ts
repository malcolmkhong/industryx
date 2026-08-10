/**
 * tests/api/auth/session/me.test.ts
 *
 * Tests for GET /api/auth/session/me — returns current user info.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRequest, readJson } from "../helpers/request";
import { mockSupabaseServer } from "../../unit/mocks/supabase";

vi.mock("@/lib/db/access", () => mockSupabaseServer());

// Import AFTER mock
import { GET } from "@/app/api/auth/session/me/route";

describe("GET /api/auth/session/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user in session", async () => {
    const req = buildRequest({ url: "/api/auth/session/me" });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when auth.getUser() returns error", async () => {
    const req = buildRequest({ url: "/api/auth/session/me" });
    vi.resetModules();
    vi.doMock("@/lib/db/access", () => {
      const errClient: any = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "token expired" },
          }),
        },
      };
      return {
        createServiceRoleClient: () => errClient,
        // BUG-077: canonical boundary names mirror the legacy alias.
        getDbClient: () => errClient,
        requireDbClient: () => ({ from: vi.fn() }),
        isDbClientConfigured: vi.fn(() => true),
        createClient: async () => errClient,
        isServiceRoleConfigured: () => true,
        isSupabaseConfigured: () => true,
      };
    });
    const fresh = await import("@/app/api/auth/session/me/route");
    const res = await fresh.GET(req);
    expect(res.status).toBe(401);
    vi.doUnmock("@/lib/supabase/server");
  });

  it("returns 200 with user payload when authenticated", async () => {
    const req = buildRequest({ url: "/api/auth/session/me" });
    vi.resetModules();
    vi.doMock("@/lib/db/access", () => {
      const client: any = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: "user-1",
                email: "test@example.com",
                role: "authenticated",
                last_sign_in_at: "2026-06-24T00:00:00Z",
                created_at: "2026-01-01T00:00:00Z",
              },
            },
            error: null,
          }),
        },
      };
      return {
        createServiceRoleClient: () => client,
        createClient: async () => client,
        isServiceRoleConfigured: () => true,
        isSupabaseConfigured: () => true,
      };
    });
    const fresh = await import("@/app/api/auth/session/me/route");
    const res = await fresh.GET(req);
    expect(res.status).toBe(200);
    const body = await readJson<any>(res);
    expect(body.user.id).toBe("user-1");
    expect(body.user.email).toBe("test@example.com");
    expect(body.user.isAdmin).toBe(false);
    vi.doUnmock("@/lib/supabase/server");
  });

  it("returns isAdmin=true when user is in ADMIN_UIDS", async () => {
    process.env.ADMIN_UIDS = "user-1,admin-user-2";
    const req = buildRequest({ url: "/api/auth/session/me" });
    vi.resetModules();
    vi.doMock("@/lib/db/access", () => {
      const client: any = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: "user-1",
                email: "test@example.com",
                role: "authenticated",
                last_sign_in_at: null,
                created_at: null,
              },
            },
            error: null,
          }),
        },
      };
      return {
        createServiceRoleClient: () => client,
        createClient: async () => client,
        isServiceRoleConfigured: () => true,
        isSupabaseConfigured: () => true,
      };
    });
    const fresh = await import("@/app/api/auth/session/me/route");
    const res = await fresh.GET(req);
    expect(res.status).toBe(200);
    const body = await readJson<any>(res);
    expect(body.user.isAdmin).toBe(true);
    delete process.env.ADMIN_UIDS;
    vi.doUnmock("@/lib/supabase/server");
  });

  it("returns 500 on unexpected error", async () => {
    const req = buildRequest({ url: "/api/auth/session/me" });
    vi.resetModules();
    vi.doMock("@/lib/db/access", () => {
      const client: any = {
        auth: {
          getUser: vi.fn().mockRejectedValue(new Error("boom")),
        },
      };
      return {
        createServiceRoleClient: () => client,
        createClient: async () => client,
        isServiceRoleConfigured: () => true,
        isSupabaseConfigured: () => true,
      };
    });
    const fresh = await import("@/app/api/auth/session/me/route");
    const res = await fresh.GET(req);
    expect(res.status).toBe(500);
    vi.doUnmock("@/lib/supabase/server");
  });
});

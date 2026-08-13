/**
 * tests/api/auth/callback.test.ts
 *
 * Boundary tests for GET /api/auth/callback.
 * Tests OAuth code exchange redirect behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRequest } from "../helpers/request";
import { mockSupabaseServer } from "../../unit/mocks/supabase";

vi.mock("@/lib/db/access", () => mockSupabaseServer());

// Mock @supabase/ssr to control the exchangeCodeForSession result.
// The default mock also exercises the Next.js 16 cookie-forwarding
// path: exchangeCodeForSession is followed by @supabase/ssr invoking
// setAll() with the new session cookies. The real production fix
// (collect-then-attach on the redirect response) depends on that
// side-effect happening synchronously inside exchangeCodeForSession.
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (
      _url: string,
      _key: string,
      options: {
        cookies: {
          getAll: () => unknown[];
          setAll: (cookies: Array<{ name: string; value: string }>) => void;
        };
      },
    ) => {
      // Hand the cookies @supabase/ssr would normally set on the
      // inbound cookies store back to the handler via setAll().
      // This mirrors the real Auth library's behavior so the
      // "forward on redirect" path is exercised.
      const onExchange = () => {
        options.cookies.setAll([
          {
            name: "sb-access-token",
            value: "test-access-token",
          },
          {
            name: "sb-refresh-token",
            value: "test-refresh-token",
          },
        ]);
        return Promise.resolve({ error: null });
      };
      return {
        auth: {
          exchangeCodeForSession: onExchange,
        },
      };
    },
  ),
}));

import { GET } from "@/app/api/auth/callback/route";

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 3xx redirect to /?auth=error when no code param", async () => {
    const req = buildRequest({ method: "GET", url: "/api/auth/callback" });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    const redirect = res.headers.get("location");
    expect(redirect).toContain("/?auth=error");
  });

  it("returns 3xx redirect to custom next param when code provided and exchange succeeds", async () => {
    const req = buildRequest({
      method: "GET",
      url: "/api/auth/callback?code=abc123&next=/game",
    });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    const redirect = res.headers.get("location");
    expect(redirect).toContain("/game");
  });

  it("returns 3xx redirect to /?auth=error when code exchange fails", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      auth: {
        exchangeCodeForSession: vi
          .fn()
          .mockResolvedValue({ error: new Error("invalid_code") }),
      },
    });

    const req = buildRequest({
      method: "GET",
      url: "/api/auth/callback?code=badcode",
    });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    const redirect = res.headers.get("location");
    expect(redirect).toContain("/?auth=error");
  });

  it("forwards Supabase session cookies on the success redirect (BUG-090)", async () => {
    // The Next.js 16 App-Router cookies() store is read-only inside a
    // GET route handler. The handler must therefore collect the
    // cookies @supabase/ssr tried to set via setAll() and forward them
    // on the OUTBOUND redirect response. Without this, the browser
    // never receives the session token and /api/auth/session/me keeps
    // returning 401 right after OAuth completes.
    const req = buildRequest({
      method: "GET",
      url: "/api/auth/callback?code=goodcode&next=/game",
    });
    const res = await GET(req);

    // 1. The redirect target is correct.
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/game");

    // 2. The Supabase session cookies the mock setAll() pushed
    //    forward are now visible on the response. cookies.get()
    //    works on NextResponse just like a Request.
    const access = res.cookies.get("sb-access-token");
    const refresh = res.cookies.get("sb-refresh-token");
    expect(access?.value).toBe("test-access-token");
    expect(refresh?.value).toBe("test-refresh-token");
  });
});

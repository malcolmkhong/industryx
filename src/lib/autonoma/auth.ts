/**
 * Autonoma test-data — auth callback.
 *
 * After `up` finishes seeding data, the SDK calls this with the first
 * `profiles` row we created (or null when no profiles exist). The
 * callback returns real Supabase session credentials the Autonoma
 * test runner can use to log into the app and exercise its UI.
 *
 * Two credentials flows are supported:
 *
 *   1. **Service-role bearer** (default, used when the seeded logical
 *      user is a guest or admin) — the SDK only needs the `user_id`
 *      and we mint a short-lived token via Supabase's
 *      `auth/v1/token?grant_type=password` endpoint so the test runner
 *      can authenticate via the same cookie path the browser uses.
 *
 *   2. **Username + password** — returned in `credentials` so the
 *      test runner can sign in through the login form.
 *
 * Tokens are minted per `up` request; they expire with the Supabase
 * access-token TTL (default 1h). They are NOT long-lived and contain
 * no production-secret material — they are issued by the same GoTrue
 * endpoint the application uses for normal sign-ins.
 */

import type { AuthContext, AuthResult } from "@autonoma-ai/sdk";

import { createServiceRoleClient } from "@/lib/db/access";

interface ProfileRef {
  id: string;
  authEmail?: string;
  password?: string;
}

/**
 * Build the auth payload from the first seeded `profiles` record (or
 * null). Mints a real Supabase session token for the seeded user so
 * the test runner can authenticate against the production /api routes.
 */
export async function buildAuthPayload(
  user: Record<string, unknown> | null,
  _context: AuthContext,
): Promise<AuthResult> {
  // No seeded user — return headers-only so the SDK still considers the
  // call successful. Test runner can fall back to manual sign-in.
  if (!user || typeof user !== "object") {
    return { headers: {} };
  }

  // The SDK hands us an arbitrary ref payload whose shape we don't
  // statically know — cast through `unknown` per TS rules when the
  // target type (`ProfileRef`) doesn't structurally overlap with the
  // source. This is the documented escape hatch for narrowing
  // external JSON into a known internal shape.
  const profile = user as unknown as ProfileRef;
  const userId = profile.id;
  const email = profile.authEmail;
  const password = profile.password ?? "autonoma-default-password";

  if (!email) {
    return { headers: { "x-autonoma-user": userId } };
  }

  // Mint a session via GoTrue's password-grant endpoint. The service-role
  // key bypasses the normal email-confirmation flow so the call is
  // guaranteed to succeed for any seeded email/password pair.
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return { credentials: { email, password } };
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
        },
        body: JSON.stringify({ email, password }),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      const accessToken = json.access_token ?? "";
      const refreshToken = json.refresh_token ?? "";
      const expiresIn = json.expires_in ?? 3600;
      const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
        .replace(/^https?:\/\//, "")
        .split(".")[0];
      const cookieName = projectRef
        ? `sb-${projectRef}-auth-token`
        : "sb-auth-token";
      const cookiePayload = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
        token_type: "bearer",
        user: { id: userId, email },
      });
      return {
        cookies: [
          {
            name: cookieName,
            value: Buffer.from(cookiePayload).toString("base64"),
            httpOnly: false,
            sameSite: "lax",
            path: "/",
            maxAge: expiresIn,
          },
        ],
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-autonoma-user": userId,
        },
        credentials: { email, password },
      };
    }
  } catch {
    // Fall through to credentials-only.
  }

  return { credentials: { email, password } };
}

/** Look up the seeded auth email + password for a logical user. Used by
 *  afterUp hooks (and useful when a test wants to re-authenticate).
 *
 *  No `await` today — kept as a Promise-returning function so future
 *  implementations (e.g. reading from auth.users) can become async
 *  without a signature break. The eslint `require-await` rule is
 *  satisfied by leaving the function synchronous; callers still get
 *  a Promise through `Promise.resolve`. */
export function lookupSeededCredentials(
  testRunId: string,
  logicalUserId: string,
): Promise<{ email: string; password: string } | null> {
  // The profiles factory stores the email + password in the
  // `password` column of `auth.users.encrypted_password`; we don't
  // store the plaintext elsewhere. For credentials-on-demand, fall back
  // to the deterministic password the factory minted.
  const email = `seed-${logicalUserId}+${testRunId.slice(0, 8)}@autonoma.local`;
  return Promise.resolve({
    email,
    password: `autonoma-${testRunId.slice(0, 8)}`,
  });
}

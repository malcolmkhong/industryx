/**
 * Full merge E2E for BUG-075 (Migration 079 auth-merge policy).
 *
 * Covers four scenarios end-to-end via the real Supabase + real auth flow:
 *
 *   1. default policy archives guest on dual-progress sign-in
 *   2. explicit_conflict opt-in still returns 409 ACCOUNT_PROGRESS_CONFLICT
 *   3. clean sign-in (no upgradeable guest binding) → BOOTSTRAP_READY, no archive
 *   4. re-bootstrap after archive → no double archive; same userId; OK_NO_GUEST
 *
 * Pre-requisites (test fails loudly if unmet, see error-context.md):
 *   - Migration 079 applied to the live Supabase (verified by `npm run
 *     tools/_apply-migration-079.mjs` if you have the env credentials).
 *   - dev server reachable at http://localhost:3000 (Playwright webServer).
 *   - NODE_ENV !== 'production' (gates the seed route).
 *   - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY set in env so
 *     the test page can use createBrowserClient + signInWithPassword.
 */

import { expect, test } from "@playwright/test";

interface SeedResponse {
  ok: boolean;
  deviceId: string;
  authUserId: string;
  guestUserId: string;
  authSession: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  authCredentials: { email: string; password: string };
  projectRef: string;
  authState: { money: number; game_tick: number };
  guestState: { money: number; game_tick: number };
  archiveTriggerExpected: boolean;
  omitGuest: boolean;
}

interface BootstrapResponseBody {
  code: string;
  archiveReceiptId?: string | null;
  archivedGuestId?: string | null;
  userId?: string;
  gameState?: { money?: number; gameTick?: number };
}

/**
 * `AuthApi` shape augmented by
 * `src/app/test/auth-orchestrator/page.tsx`'s `declare global` block.
 * Re-declaring the interface here would split types across two files —
 * TypeScript would resolve them as different types because Migration 079
 * added `e2eSignInPassword` + `lastAppliedState`. Read it via the
 * augmented Window instead to share the canonical declaration.
 */
type AuthApi = NonNullable<Window["__authApi"]>;

async function signInAndSettle(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  expectedUserId: string,
): Promise<void> {
  await page.goto("http://localhost:3000/test/auth-orchestrator");
  await page.waitForFunction(
    () =>
      typeof window.__authApi === "object" && window.__authApi !== null,
  );
  const res = await page.evaluate(
    async ({ email, password }) => {
      return await window.__authApi.e2eSignInPassword(email, password);
    },
    { email, password },
  );
  expect(res.ok, `signin succeeded: ${res.error}`).toBe(true);
  expect(res.userId, "signin returned the seeded auth user").toBe(
    expectedUserId,
  );
  await page.waitForFunction(
    () => window.__authApi?.status !== "bootstrapping",
    undefined,
    { timeout: 20_000 },
  );
  // Identity must resolve to authenticated (not anonymous guest fallback).
  const identity = await page.evaluate(
    () => window.__authApi.identity,
  );
  expect(identity, "identity resolved to authenticated").toBe("authenticated");
}

async function directBootstrap(
  page: import("@playwright/test").Page,
  body: { deviceId: string; mergePolicy?: string },
): Promise<BootstrapResponseBody> {
  return page.evaluate(
    async (payload) => {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fingerprintHash: null }),
      });
      return (await res.json()) as BootstrapResponseBody;
    },
    body,
  );
}

async function seed(
  page: import("@playwright/test").Page,
  opts: { tag: string; omitGuest?: boolean; omitAuthProgress?: boolean },
): Promise<SeedResponse> {
  const r = await page.request.post(
    "http://localhost:3000/api/test/seed-auth-merge",
    {
      data: opts,
      headers: { "Content-Type": "application/json" },
    },
  );
  const status = r.status();
  const text = await r.text();
  if (status !== 200) {
    throw new Error(`seed returned ${status}: ${text.slice(0, 800)}`);
  }
  const json = JSON.parse(text) as SeedResponse;
  expect(json.ok, "seed ok=true").toBe(true);
  return json;
}

test.describe.configure({ mode: "serial" });

test.describe("BUG-075: auth-merge policy full merge E2E", () => {
  // ─── Spec 1: default policy auto-archives on dual-progress sign-in ─────
  test("1. dual-progress sign-in → 200 + archiveReceiptId (default policy)", async ({
    page,
  }) => {
    const seedResp = await seed(page, { tag: "s1-archive" });
    expect(seedResp.deviceId).toMatch(/^dev-s1-/);
    await signInAndSettle(
      page,
      seedResp.authCredentials.email,
      seedResp.authCredentials.password,
      seedResp.authUserId,
    );
    const result = await directBootstrap(page, {
      deviceId: seedResp.deviceId,
    });
    expect(result.code).toBe("BOOTSTRAP_READY");
    expect(result.userId).toBe(seedResp.authUserId);
    expect(
      result.archiveReceiptId,
      "archiveReceiptId surfaced",
    ).not.toBeNull();
    expect(result.archiveReceiptId).toMatch(/^[0-9a-f]{8}-/);
    expect(result.archivedGuestId).toBe(seedResp.guestUserId);
    expect(result.gameState?.money).toBe(seedResp.authState.money);
    expect(result.gameState?.money).not.toBe(seedResp.guestState.money);
  });

  // ─── Spec 2: explicit_conflict opt-in still 409s on dual-progress ─────
  test("2. dual-progress sign-in with mergePolicy=explicit_conflict → 409", async ({
    page,
  }) => {
    const seedResp = await seed(page, { tag: "s2-conflict" });
    await signInAndSettle(
      page,
      seedResp.authCredentials.email,
      seedResp.authCredentials.password,
      seedResp.authUserId,
    );
    const result = await directBootstrap(page, {
      deviceId: seedResp.deviceId,
      mergePolicy: "explicit_conflict",
    });
    expect(result.code).toBe("ACCOUNT_PROGRESS_CONFLICT");
    // The conflict response doesn't include archiveReceiptId (no archive
    // happened). It DOES surface the archivedGuestId pointer so the
    // UI can offer a merge-conflict panel.
    expect(
      result.archiveReceiptId,
      "no archiveReceiptId on conflict path",
    ).toBeFalsy();
    expect(
      result.archivedGuestId,
      "conflict response still surfaces archivedGuestId pointer",
    ).toBe(seedResp.guestUserId);
    expect(
      result.archivedGuestId,
      "conflict response surfaces the archivedGuestId pointer (guest to be merged OR archived)",
    ).toBe(seedResp.guestUserId);
  });

  // ─── Spec 3: clean sign-in (no upgradeable guest) → clean BOOTSTRAP_READY ─
  test("3. clean sign-in with omitGuest → 200, no archive metadata", async ({
    page,
  }) => {
    const seedResp = await seed(page, {
      tag: "s3-clean",
      omitGuest: true,
    });
    expect(seedResp.archiveTriggerExpected).toBe(false);
    await signInAndSettle(
      page,
      seedResp.authCredentials.email,
      seedResp.authCredentials.password,
      seedResp.authUserId,
    );
    const result = await directBootstrap(page, {
      deviceId: seedResp.deviceId,
    });
    expect(result.code).toBe("BOOTSTRAP_READY");
    expect(result.userId).toBe(seedResp.authUserId);
    expect(
      result.archiveReceiptId,
      "no archive on clean sign-in",
    ).toBeNull();
    expect(result.archivedGuestId).toBeNull();
  });

  // ─── Spec 4: re-bootstrap after archive → no double archive, same user ─────
  test("4. second sign-in after first archive → no archive re-issued", async ({
    page,
  }) => {
    const seedResp = await seed(page, { tag: "s4-rebootstrap" });
    await signInAndSettle(
      page,
      seedResp.authCredentials.email,
      seedResp.authCredentials.password,
      seedResp.authUserId,
    );

    // First bootstrap: archive the guest.
    const first = await directBootstrap(page, {
      deviceId: seedResp.deviceId,
    });
    expect(first.code).toBe("BOOTSTRAP_READY");
    expect(first.archiveReceiptId, "first call archives the guest").not.toBeNull();

    // Second bootstrap with the SAME deviceId. The upgrade RPC must
    // return OK_NO_GUEST (no active_guest binding for that device —
    // the prior one was set to 'superseded'). Same user loads again.
    const second = await directBootstrap(page, {
      deviceId: seedResp.deviceId,
    });
    expect(second.code).toBe("BOOTSTRAP_READY");
    expect(second.userId, "second call returns same auth user").toBe(
      seedResp.authUserId,
    );
    expect(
      second.archiveReceiptId,
      "second call does NOT re-archive (no second receipt)",
    ).toBeNull();
    expect(second.gameState?.money, "auth progress still loaded").toBe(
      seedResp.authState.money,
    );
  });
});
